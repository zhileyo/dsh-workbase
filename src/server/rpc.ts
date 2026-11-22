import { ZodError } from 'zod';
import { commandSchema } from '../shared/commands.js';
import { WorkbaseError } from '../shared/model.js';
import type { WorkbaseService } from './service.js';
import { downloadCatppuccin } from './terminal-palette.js';
import type { ExtensionsPort } from '../shared/extensions.js';

export async function dispatch(service: WorkbaseService, payload: unknown, owner: boolean, signal: AbortSignal, extensions?: ExtensionsPort) {
  try {
    if (!owner) throw new WorkbaseError('forbidden', '仅宿主所有者可访问工作台');
    signal.throwIfAborted();
    const command = commandSchema.parse(payload);
    let value: unknown;
    switch (command.op) {
      case 'speech-stream-text':
      case 'speech-stream-cancel':
        if (!service.speech) throw new WorkbaseError('unavailable', '语音播报尚未就绪');
        if (command.op === 'speech-stream-text') service.speech.pushStream(command.id, command.seq, command.text, command.finish);
        else service.speech.cancelStream(command.id);
        value = null; break;
      case 'speech-status':
      case 'speech-save':
      case 'speech-synthesize':
        if (!service.speech) throw new WorkbaseError('unavailable', '语音播报尚未就绪');
        value = command.op === 'speech-status' ? await service.speech.status()
          : command.op === 'speech-save' ? await service.speech.save(command.version, command.config, command.key, command.clearKey)
          : await service.speech.synthesize(command.text, signal, command.manual);
        break;
      case 'personal-list': value = await service.personalList(signal); break;
      case 'personal-save': value = await service.personalSave(command.file, command.version, command.content, signal); break;
      case 'extensions':
        if (!extensions) throw new WorkbaseError('unavailable', '扩展模块尚未就绪，请重试');
        value = await extensions.handle(command.module, command.method, command.input, signal); break;
      case 'snapshot': value = await service.snapshot(signal); break;
      case 'migration-preview': value = await service.previewMigration(command, signal); break;
      case 'migration-preview-project': value = await service.previewProjectMigration(command, signal); break;
      case 'migration-confirm': value = await service.confirmMigration(command.token); break;
      case 'migration-discard': value = service.discardMigration(command.token); break;
      case 'migration-records': value = await service.migrationRecords(command.projectId); break;
      case 'migration-undo': value = await service.undoMigration(command.id); break;
      case 'terminal-catppuccin': value = await downloadCatppuccin(signal); break;
      case 'terminal-palette': value = await service.saveTerminalPalette(command.expected, command.value); break;
      case 'backup-status': value = await service.backupStatus(); break;
      case 'backup-start': value = await service.startBackup('manual'); break;
      case 'backup-startup': value = await service.startBackup('startup'); break;
      case 'restore-status': value = await service.restoreStatus(); break;
      case 'restore-catalog': value = await service.restoreCatalog(); break;
      case 'restore-preview': value = await service.previewRestore({ archive: command.archive, keyPath: command.keyPath }); break;
      case 'restore-confirm': value = await service.confirmRestore(command); break;
      case 'restore-discard': value = await service.discardRestore(command.token); break;
      case 'diagnose': value = await service.diagnose(signal); break;
      case 'repair-diagnostics': value = await service.repairDiagnostics(command, signal); break;
      case 'create': value = await service.createTodo(command, undefined, signal); break;
      case 'update': value = await service.updateTodo(command, undefined, signal); break;
      case 'remove-todo-image': value = await service.removeTodoImage(command, undefined, signal); break;
      case 'remove-todo-attachment': value = await service.removeTodoAttachment(command, undefined, signal); break;
      case 'delete': value = await service.deleteTodo(command, undefined, signal); break;
      case 'restore-deleted-todo': value = await service.restoreDeletedTodo(command, undefined, signal); break;
      case 'rename': value = await service.renameProject(command.projectId, command.title); break;
      case 'permission': value = await service.setAgentStatus(command.projectId, command.allowed); break;
      case 'binding': value = await service.resolveBinding(command); break;
      case 'mark': value = await service.setMark(command); break;
      case 'preferences': value = await service.setPreferences(command.patch, command.expectedRevision); break;
      case 'settings': value = await service.saveSettings(command.theme, command.permissions, command.options, command.expectedRevision); break;
      case 'rules-save': value = await service.saveRules(command.expectedRules, command.rules, command.expectedRevision); break;
      case 'add-project': value = await service.addProject(command.path, command.name, command.initialization); break;
      case 'remove-project': value = await service.removeProject(command.projectId); break;
      case 'search-sessions': value = await service.searchSessions(command.query, signal); break;
      case 'launch-catalog': value = await service.launchCatalog(); break;
      case 'native-session-check': value = await service.checkNativeSession(command.workspaceId, command.sessionId, signal, command.hold); break;
      case 'native-session-release': value = await service.releaseNativeSession(command.token); break;
      case 'begin-session': value = await service.beginSession(command.projectId, command.preset, command.sessionId, command.requestId); break;
      case 'configure-session-model': value = await service.configureSessionModel(command, signal); break;
      case 'submit-message': value = await service.submitMessage(command, signal); break;
      case 'rename-session': value = await service.renameSession(command.projectId, command.sessionId, command.title); break;
      case 'delete-session': value = await service.deleteSession(command.projectId, command.sessionId); break;
      case 'reveal-directory': value = await service.revealDirectory(command.projectId); break;
      case 'session-preview': value = await service.sessionPreview(command, signal); break;
      case 'archive-project': value = await service.archiveProject(command); break;
      case 'git-branches': value = await service.gitBranches(command.projectId, signal); break;
    }
    return { ok: true as const, value };
  } catch (error) {
    return { ok: false as const, error: {
      code: error instanceof WorkbaseError ? error.code : error instanceof ZodError ? 'invalid' : signal.aborted ? 'cancelled' : 'internal',
      message: error instanceof ZodError ? '参数不合法，请检查输入' : error instanceof Error ? error.message : '操作失败',
      details: {},
    } };
  }
}
