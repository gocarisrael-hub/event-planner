import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Catalog from './pages/Catalog.jsx';
import Categories from './pages/Categories.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DayBuilder from './pages/DayBuilder.jsx';
import EventsTable from './pages/EventsTable.jsx';
import NewDay from './pages/NewDay.jsx';
import ProposalPreview from './pages/ProposalPreview.jsx';
import Login from './pages/Login.jsx';
import Settings from './pages/Settings.jsx';
import './styles/index.css';

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    // Auth gate: validates token, redirects unauthed → /login,
    // and constrains viewers to /status.
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/new', element: <NewDay /> },
          { path: '/day/:id', element: <DayBuilder /> },
          { path: '/status', element: <EventsTable /> },
          { path: '/catalog', element: <Catalog /> },
          { path: '/categories', element: <Categories /> },
          { path: '/settings', element: <Settings /> },
        ],
      },
      // Standalone print page (no app chrome) — still requires auth.
      { path: '/day/:id/proposal', element: <ProposalPreview /> },
    ],
  },
]);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
