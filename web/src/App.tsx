import { Routes, Route } from 'react-router-dom';
import Layout from './layout/Layout';
import Terminal from './pages/Terminal';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Terminal />} />
        <Route path="terminal" element={<Terminal />} />
      </Route>
    </Routes>
  );
}
