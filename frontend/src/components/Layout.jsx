import React from 'react';
import { FileUp, ListChecks } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const Layout = () => {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">LOA</div>
          <div>
            <h1>IREPS LOA</h1>
            <span>Parser</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          <NavLink to="/upload" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <FileUp size={18} />
            Upload
          </NavLink>
          <NavLink to="/loa" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            <ListChecks size={18} />
            Records
          </NavLink>
        </nav>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
