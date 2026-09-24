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


export const uploadSingleLoaFile = async (file,
  loa_restricted,
  location,
  unit) => {
  const formData = new FormData();
  
  loa_restricted = loa_restricted === 'Yes' || loa_restricted === 'Y' ? 'Y' : 'N';

  formData.append('file', file);
  formData.append('whether_loa_restricted', loa_restricted);
  formData.append('section_location', location);
  formData.append('divcode', unit);

  const response = await api.post('/loa/upload-single', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
}

export const getUnits = async () => {
  const response = await api.get('/loa/unit');
  return response.data;
};

export const getLoaRestrictions = async (id) => (await api.get(`/loa/record/${id}/restrictions`)).data;
export const updateLoaRestrictions = async (id, rows, revision) => (
  await api.put(`/loa/record/${id}/restrictions`, { rows, revision })
).data;

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

export const getLoaHtmlFile = async (loaNo) => {
  const response = await api.get(`/loa/file/${encodeURIComponent(loaNo)}`, {
    responseType: 'text'
  });
  return response.data;
};

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
