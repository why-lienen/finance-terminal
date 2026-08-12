import { Routes, Route } from 'react-router-dom';
import Layout from './layout/Layout';
import Dashboard from './pages/Dashboard';
import Stocks from './pages/Stocks';
import Funds from './pages/Funds';
import Gold from './pages/Gold';
import Holdings from './pages/Holdings';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="stocks" element={<Stocks />} />
        <Route path="funds" element={<Funds />} />
        <Route path="gold" element={<Gold />} />
        <Route path="holdings" element={<Holdings />} />
      </Route>
    </Routes>
  );
}
