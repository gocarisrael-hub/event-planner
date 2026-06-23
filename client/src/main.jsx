import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Catalog from './pages/Catalog.jsx';
import Categories from './pages/Categories.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DayBuilder from './pages/DayBuilder.jsx';
import NewDay from './pages/NewDay.jsx';
import ProposalPreview from './pages/ProposalPreview.jsx';
import './styles/index.css';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/new', element: <NewDay /> },
      { path: '/day/:id', element: <DayBuilder /> },
      { path: '/catalog', element: <Catalog /> },
      { path: '/categories', element: <Categories /> },
    ],
  },
  // Standalone print page (no app chrome).
  { path: '/day/:id/proposal', element: <ProposalPreview /> },
]);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
