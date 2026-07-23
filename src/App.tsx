import { TopNav } from './components/TopNav';
import { DirectorPage } from './pages/director/DirectorPage';

export default function App() {
  return (
    <div className="app-shell">
      <TopNav />
      <DirectorPage />
    </div>
  );
}
