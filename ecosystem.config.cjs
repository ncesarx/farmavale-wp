module.exports = {
  apps: [{
    name: "farmavale-central",
    script: "node_modules/next/dist/bin/next",
    args: "start",
    cwd: __dirname,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "700M",
    env: {
      NODE_ENV: "production",
      PORT: process.env.APP_PORT || 3000,
      HOSTNAME: "127.0.0.1",
    },
  }],
};
