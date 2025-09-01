import api from './axiosInstance.js';


export async function getMonth(ym /* 'YYYY-MM' */) {
const { data } = await api.get(`/api/calendar/${ym}`);
return data; // { days: { 'YYYY-MM-DD': {tasks,appointments,events} } }
}


export async function getUpcoming(from /* 'YYYY-MM-DD' */) {
const { data } = await api.get('/api/calendar/upcoming/list', { params: { from } });
return data; // { today, appointments:[...], events:[...] }
}