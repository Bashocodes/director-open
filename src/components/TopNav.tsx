export function TopNav() {
  return (
    <header className="top-nav">
      <nav aria-label="Workspace">
        <a className="active" href="/director/" aria-current="page">Director</a>
        <a href="/conductor/">Conductor</a>
      </nav>
    </header>
  );
}
