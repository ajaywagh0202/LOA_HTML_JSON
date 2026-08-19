import React from 'react';
import { FileSearch, FileUp, Home, ListChecks } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const HOME_URL = "http://10.31.3.227/larbank";

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
          <NavLink
            to="/view-loa"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            <FileSearch size={18} />
            View LOA
          </NavLink>
        </nav>
      </aside>

      <main className="main-content">
        <div className="global-page-actions">
          <button className="button primary" type="button" onClick={() => window.open(HOME_URL)}>
            <Home size={18} />
            Home
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
