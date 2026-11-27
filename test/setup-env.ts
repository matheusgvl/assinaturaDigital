const originalPort = process.env.PORT;

if (typeof originalPort === 'undefined') {
  process.env.PORT = '3000';
}

afterAll(() => {
  if (typeof originalPort === 'undefined') {
    delete process.env.PORT;
  } else {
    process.env.PORT = originalPort;
  }
});
