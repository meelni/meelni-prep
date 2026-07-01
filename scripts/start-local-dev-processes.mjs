export function getChildExitAction({ role }) {
  return role === "web" || role === "inngest" ? "exit" : "keep-running";
}
