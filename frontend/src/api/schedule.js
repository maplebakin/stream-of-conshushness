import api from './axiosInstance.js';


export async function getDaySchedule(dateISO) {
const { data } = await api.get(`/api/schedule/${encodeURIComponent(dateISO)}`);
return data;
}