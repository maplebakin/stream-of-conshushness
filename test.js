const http = require('http');

const data = JSON.stringify({
  date: "2025-07-15",
  time: "14:00",
  details: "Test Appointment from script"
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/add-appointment',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
