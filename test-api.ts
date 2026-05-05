
import fetch from 'node-fetch';

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/health');
    const data = await res.json();
    console.log('Health check:', data);
  } catch (e) {
    console.error('Health check failed:', e.message);
  }
}

test();
