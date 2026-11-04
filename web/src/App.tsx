import { Routes, Route, useSearchParams } from 'react-router-dom';
import Layout from './layout/Layout';
import Terminal from './pages/Terminal';
import FloatWidget from './components/FloatWidget';
import ChartWindow from './components/ChartWindow';

export default function App() {
  const [params] = useSearchParams();
  // 点卡片打开的独立「放大图表」窗口：?chart=1&secid=...&name=...&code=...&kind=...
  if (params.get('chart')) {
    const num = (k: string) => {
      const v = params.get(k);
      return v != null && v.trim() !== '' ? Number(v) : undefined;
    };
    return (
      <ChartWindow
        secid={params.get('secid') || ''}
        name={params.get('name') || ''}
        code={params.get('code') || ''}
        kind={(params.get('kind') || 'stock') as 'gold' | 'stock' | 'fixed'}
        prevClose={num('prevClose')}
        unit={params.get('unit') || undefined}
        sub={params.get('sub') || undefined}
      />
    );
  }
  // 拖出卡片的独立浮窗：?float=1&secid=...&name=...&code=...&kind=...
  if (params.get('float')) {
    return (
      <FloatWidget
        secid={params.get('secid') || ''}
        name={params.get('name') || ''}
        code={params.get('code') || ''}
        kind={(params.get('kind') || 'stock') as 'gold' | 'stock' | 'fixed'}
      />
    );
  }
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Terminal />} />
        <Route path="terminal" element={<Terminal />} />
      </Route>
    </Routes>
  );
}
