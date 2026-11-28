/**
 * Windows 保留设备名与非法字符的唯一判定：创建项目目录（server/host.ts）、
 * 技能命名（shared/skills.ts）与恢复归档（server/restore-archive.ts）三条入口
 * 共用同一份清单，改清单只改这里，避免三处正则漂移。
 */
/** Windows 保留设备名：作为名称或目录段、带 `.` 后缀时同样命中（con.txt、COM1）。 */
export const isWindowsReservedName = (name: string) =>
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
/** Windows 文件名非法字符：不含路径分隔符，分隔符由各入口按自身语境单独校验。 */
export const hasWindowsIllegalChar = (name: string) => /[<>:"|?*]/.test(name);
