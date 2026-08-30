import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { CreateOrderPage } from './pages/CreateOrderPage';
import { CustomersPage } from './pages/CustomersPage';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`;

export function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌶️</span>
            <div>
              <p className="text-sm font-semibold leading-tight text-slate-900">Spice Garden</p>
              <p className="text-xs leading-tight text-slate-500">Internal ops tool · v1</p>
            </div>
          </div>
          <nav className="flex gap-1">
            <NavLink to="/orders" className={navLinkClass}>Orders</NavLink>
            <NavLink to="/customers" className={navLinkClass}>Customers</NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<CreateOrderPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </main>
    </div>
  );
}
