export function studentPortalOpen(): boolean {
  return process.env.STUDENT_PORTAL_ENABLED !== "false";
}
