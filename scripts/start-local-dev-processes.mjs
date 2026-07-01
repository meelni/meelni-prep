export function getChildExitAction({ role }) {
  return role === "web" ? "exit" : "keep-running";
}
