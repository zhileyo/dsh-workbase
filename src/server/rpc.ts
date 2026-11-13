import { ZodError } from 'zod';
import { commandSchema } from '../shared/commands.js';
import { WorkbaseError } from '../shared/model.js';
import type { WorkbaseService } from './service.js';
import { downloadCatppuccin } from './terminal-palette.js';

export async function dispatch(service: WorkbaseService, payload: unknown, owner: boolean, signal: AbortSignal) {
  try {
    if (!owner) throw new WorkbaseError('forbidden', '仅宿主所有者可访问工作台');
    signal.throwIfAborted();
    const command = commandSchema.parse(payload);
    let value: unknown;
    switch (command.op) {
      case 'snapshot': value = await service.snapshot(signal); break;
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
      case 'preferences': value = await service.setPreferences(command.patch); break;
      case 'settings': value = await service.saveSettings(command.theme, command.permissions, command.options); break;
      case 'add-project': value = await service.addProject(command.path, command.name); break;
      case 'remove-project': value = await service.removeProject(command.projectId); break;
      case 'search-sessions': value = await service.searchSessions(command.query, signal); break;
      case 'launch-catalog': value = await service.launchCatalog(); break;
      case 'begin-session': value = await service.beginSession(command.projectId, command.preset); break;
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
