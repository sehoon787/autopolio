type Ports = {
  frontend: number
  backend: number
}

type RuntimeConfig = {
  ports: {
    external: Ports
    docker: Ports
  }
}

const fallback: RuntimeConfig = {
  ports: {
    external: { frontend: 3035, backend: 8085 },
    docker: { frontend: 3000, backend: 8000 },
  },
}

export const runtimeConfig: RuntimeConfig = (() => {
  const raw = typeof __RUNTIME_CONFIG__ !== 'undefined' ? __RUNTIME_CONFIG__ : {}
  const external = raw?.ports?.external ?? {}
  const docker = raw?.ports?.docker ?? {}

  return {
    ports: {
      external: {
        frontend: Number(external.frontend) || fallback.ports.external.frontend,
        backend: Number(external.backend) || fallback.ports.external.backend,
      },
      docker: {
        frontend: Number(docker.frontend) || fallback.ports.docker.frontend,
        backend: Number(docker.backend) || fallback.ports.docker.backend,
      },
    },
  }
})()

export const externalFrontendUrl = `http://localhost:${runtimeConfig.ports.external.frontend}`
export const externalBackendUrl = `http://localhost:${runtimeConfig.ports.external.backend}`
