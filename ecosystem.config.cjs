module.exports = {
  apps : [{
    name: "fworkk-server",
    script: "server.js",
    instances: "max",
    exec_mode: "cluster",
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: "development",
    },
    env_production: {
      NODE_ENV: "production",
    }
  }]
}
