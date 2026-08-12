import axios from 'axios';

const UID_KEY = 'ft_uid';

function getUid(): string {
  let u = localStorage.getItem(UID_KEY);
  if (!u) {
    u = crypto.randomUUID();
    localStorage.setItem(UID_KEY, u);
  }
  return u;
}

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  cfg.headers = { ...(cfg.headers as any), 'x-user-id': getUid() } as any;
  return cfg;
});

// 响应头可能携带后端新分配的 uid
api.interceptors.response.use((resp) => {
  const uid = resp.headers['x-user-id'];
  if (uid) localStorage.setItem(UID_KEY, uid);
  return resp;
});
