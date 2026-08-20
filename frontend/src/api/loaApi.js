import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api'
});

export const uploadLoaFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/loa/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  return response.data;
};

export const uploadLoaFilesBulk = async (files, onUploadProgress) => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  const response = await api.post('/loa/upload-bulk', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress
  });

  return response.data;
};

export const getLoaLetters = async ({ page = 1, limit = 10, search = '', syncStatus = 'all' } = {}) => {
  const response = await api.get('/loa', {
    params: { page, limit, search, syncStatus }
  });
  return response.data;
};

export const getLoaById = async (id) => {
  const response = await api.get(`/loa/record/${id}`);
  return response.data;
};

export const getLoaHtmlFileUrl = (loaNo) =>
  api.getUri({ url: `/loa/file/${encodeURIComponent(loaNo)}` });

export const getViewLoaList = async () => {
  const response = await api.get('/loa/list');
  return response.data;
};

export const getViewLoa = async (loaNo) => {
  const response = await api.get(`/loa/${encodeURIComponent(loaNo)}`);
  return response.data;
};

export const updateLoa = async (id, payload) => {
  const response = await api.put(`/loa/${id}`, payload);
  return response.data;
};

export const syncLoaToPostgres = async (id) => {
  const response = await api.post(`/loa/sync/${id}`);
  return response.data;
};

export const deleteLoa = async (id) => {
  const response = await api.delete(`/loa/${id}`);
  return response.data;
};

export default api;
