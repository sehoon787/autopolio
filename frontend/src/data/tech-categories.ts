/**
 * Technology categories and icon mappings for tech badges
 * Extracted from tech-badge.tsx for maintainability
 */

// Custom SVG icons for technologies where simple-icons doesn't look good at small sizes
export const CUSTOM_ICONS: Record<string, { svg: string; color: string }> = {
  // Java - Simple coffee cup icon (more recognizable than Duke mascot at small sizes)
  "java": {
    svg: `<svg viewBox="0 0 24 24"><path d="M5 6h14v1c0 3.5-2 6-5 7v1h2c1.1 0 2 .9 2 2v1H6v-1c0-1.1.9-2 2-2h2v-1c-3-1-5-3.5-5-7V6zm2 1c.2 2.5 1.8 4.5 4 5.3V15h2v-2.7c2.2-.8 3.8-2.8 4-5.3H7zM8 3h8v2H8V3z"/></svg>`,
    color: "#ED8B00"
  },
  // Also map openjdk to the same icon
  "openjdk": {
    svg: `<svg viewBox="0 0 24 24"><path d="M5 6h14v1c0 3.5-2 6-5 7v1h2c1.1 0 2 .9 2 2v1H6v-1c0-1.1.9-2 2-2h2v-1c-3-1-5-3.5-5-7V6zm2 1c.2 2.5 1.8 4.5 4 5.3V15h2v-2.7c2.2-.8 3.8-2.8 4-5.3H7zM8 3h8v2H8V3z"/></svg>`,
    color: "#ED8B00"
  },
  // Maven - Clean arrow/chevron design representing build direction
  "maven": {
    svg: `<svg viewBox="0 0 24 24"><path d="M4 4h6l6 8-6 8H4l6-8-6-8zm8 0h6l6 8-6 8h-6l6-8-6-8z"/></svg>`,
    color: "#C71A36"
  },
  // Also map apachemaven to the same icon
  "apachemaven": {
    svg: `<svg viewBox="0 0 24 24"><path d="M4 4h6l6 8-6 8H4l6-8-6-8zm8 0h6l6 8-6 8h-6l6-8-6-8z"/></svg>`,
    color: "#C71A36"
  },
}

// Technology to Simple Icons slug mapping
export const TECH_TO_ICON: Record<string, string> = {
  // Programming Languages
  "JavaScript": "javascript",
  "TypeScript": "typescript",
  "Python": "python",
  "Java": "openjdk",
  "Kotlin": "kotlin",
  "Go": "go",
  "Rust": "rust",
  "Ruby": "ruby",
  "PHP": "php",
  "C#": "csharp",
  "C++": "cplusplus",
  "C": "c",
  "Swift": "swift",
  "Dart": "dart",
  "Scala": "scala",
  "Elixir": "elixir",
  "Haskell": "haskell",
  "R": "r",
  "Shell": "gnubash",
  "Bash": "gnubash",
  "PowerShell": "powershell",
  "Groovy": "apachegroovy",

  // Frontend Frameworks
  "React": "react",
  "React Native": "react",
  "Vue.js": "vuedotjs",
  "Vue": "vuedotjs",
  "Angular": "angular",
  "Svelte": "svelte",
  "Next.js": "nextdotjs",
  "Nuxt.js": "nuxtdotjs",
  "Gatsby": "gatsby",
  "Remix": "remix",
  "Astro": "astro",
  "SolidJS": "solid",
  "Preact": "preact",
  "Qwik": "qwik",
  "Alpine.js": "alpinedotjs",
  "Lit": "lit",
  "Ember.js": "emberdotjs",

  // Backend Frameworks
  "Node.js": "nodedotjs",
  "Django": "django",
  "Flask": "flask",
  "FastAPI": "fastapi",
  "Express": "express",
  "Express.js": "express",
  "NestJS": "nestjs",
  "Spring": "spring",
  "Spring Boot": "springboot",
  "Rails": "rubyonrails",
  "Ruby on Rails": "rubyonrails",
  "Laravel": "laravel",
  "Symfony": "symfony",
  "Gin": "gin",
  "Fiber": "fiber",
  "Actix": "actix",
  "Rocket": "rocket",
  "Ktor": "ktor",
  "Hapi": "hapi",
  "Koa": "koa",
  "Fastify": "fastify",

  // Mobile
  "Flutter": "flutter",
  "SwiftUI": "swift",
  "Jetpack Compose": "jetpackcompose",
  "Expo": "expo",
  "Ionic": "ionic",

  // State Management
  "Redux": "redux",
  "MobX": "mobx",
  "Zustand": "zustand",
  "Recoil": "recoil",
  "Pinia": "pinia",
  "Vuex": "vuex",

  // UI Libraries
  "Tailwind CSS": "tailwindcss",
  "Tailwind": "tailwindcss",
  "Bootstrap": "bootstrap",
  "Material UI": "mui",
  "MUI": "mui",
  "Chakra UI": "chakraui",
  "Ant Design": "antdesign",
  "Sass": "sass",
  "SCSS": "sass",
  "Less": "less",
  "PostCSS": "postcss",
  "Radix UI": "radixui",
  "Shadcn/ui": "shadcnui",
  "Mantine": "mantine",
  "Vuetify": "vuetify",
  "Bulma": "bulma",
  "Storybook": "storybook",

  // Databases
  "PostgreSQL": "postgresql",
  "MySQL": "mysql",
  "MongoDB": "mongodb",
  "Redis": "redis",
  "SQLite": "sqlite",
  "MariaDB": "mariadb",
  "Oracle": "oracle",
  "Cassandra": "apachecassandra",
  "Neo4j": "neo4j",
  "Firebase": "firebase",
  "Supabase": "supabase",
  "Prisma": "prisma",
  "Sequelize": "sequelize",
  "Mongoose": "mongoose",

  // DevOps & Cloud
  "Docker": "docker",
  "Kubernetes": "kubernetes",
  "AWS": "amazonwebservices",
  "Azure": "microsoftazure",
  "GCP": "googlecloud",
  "Google Cloud": "googlecloud",
  "Vercel": "vercel",
  "Netlify": "netlify",
  "Heroku": "heroku",
  "DigitalOcean": "digitalocean",
  "Cloudflare": "cloudflare",
  "Nginx": "nginx",
  "Apache": "apache",
  "Jenkins": "jenkins",
  "GitHub Actions": "githubactions",
  "GitLab CI": "gitlab",
  "CircleCI": "circleci",
  "Terraform": "terraform",
  "Ansible": "ansible",
  "Helm": "helm",
  "ArgoCD": "argo",

  // Build Tools
  "Webpack": "webpack",
  "Vite": "vite",
  "Rollup": "rollupdotjs",
  "Parcel": "parcel",
  "esbuild": "esbuild",
  "Babel": "babel",
  "ESLint": "eslint",
  "Prettier": "prettier",
  "npm": "npm",
  "Yarn": "yarn",
  "pnpm": "pnpm",
  "Bun": "bun",

  // Testing
  "Jest": "jest",
  "Mocha": "mocha",
  "Vitest": "vitest",
  "Cypress": "cypress",
  "Playwright": "playwright",
  "Selenium": "selenium",
  "Puppeteer": "puppeteer",

  // Data Science & ML
  "NumPy": "numpy",
  "Pandas": "pandas",
  "scikit-learn": "scikitlearn",
  "TensorFlow": "tensorflow",
  "PyTorch": "pytorch",
  "Keras": "keras",
  "Jupyter": "jupyter",
  "OpenCV": "opencv",
  "OpenAI": "openai",

  // Visualization
  "D3.js": "d3dotjs",
  "Chart.js": "chartdotjs",
  "Three.js": "threedotjs",
  "Plotly": "plotly",

  // Animation
  "Framer Motion": "framer",
  "GSAP": "greensock",

  // Forms & Validation
  "Zod": "zod",

  // Documentation
  "Docusaurus": "docusaurus",
  "GitBook": "gitbook",

  // CMS
  "Strapi": "strapi",
  "Contentful": "contentful",
  "Sanity": "sanity",
  "Ghost": "ghost",
  "WordPress": "wordpress",
  "Drupal": "drupal",

  // Message Queue
  "RabbitMQ": "rabbitmq",
  "Kafka": "apachekafka",

  // Observability
  "Prometheus": "prometheus",
  "Grafana": "grafana",
  "Datadog": "datadog",
  "Sentry": "sentry",
  "Elastic": "elastic",

  // Payment
  "Stripe": "stripe",
  "PayPal": "paypal",

  // Tools
  "Git": "git",
  "GitHub": "github",
  "GitLab": "gitlab",
  "Bitbucket": "bitbucket",
  "Jira": "jira",
  "Confluence": "confluence",
  "Notion": "notion",
  "Figma": "figma",
  "Postman": "postman",
  "Insomnia": "insomnia",
  "VS Code": "visualstudiocode",
  "WebStorm": "webstorm",
  "IntelliJ IDEA": "intellijidea",

  // Others
  "GraphQL": "graphql",
  "Apollo": "apollographql",
  "Axios": "axios",
  "Socket.io": "socketdotio",
  "Electron": "electron",
  "Tauri": "tauri",
  "HTML": "html5",
  "CSS": "css3",
  "Markdown": "markdown",
  "JSON": "json",
  "YAML": "yaml",
  "WebAssembly": "webassembly",
  "Wasm": "webassembly",

  // Java ecosystem
  "Maven": "apachemaven",
  "Gradle": "gradle",
  "JUnit": "junit5",
  "Hibernate": "hibernate",

  // Python ecosystem
  "Celery": "celery",
  "SQLAlchemy": "sqlalchemy",
  "Pydantic": "pydantic",
  "pytest": "pytest",
  "Poetry": "poetry",

  // Flutter packages
  "GetX": "getx",
  "Dio": "dart",
  "Hive": "hive",
  "Riverpod": "riverpod",
  "Bloc": "bloc",

  // Others
  "JWT": "jsonwebtokens",
  "OAuth": "oauth",
  "Auth0": "auth0",
  "Clerk": "clerk",
  "Swagger": "swagger",
  "OpenAPI": "openapiinitiative",
  "Naver": "naver",
  "Kakao": "kakao",
  "Line": "line",

  // Specific technologies
  "Docker Compose": "docker",
  "Dockerfile": "docker",
  "CMake": "cmake",
  "Objective-C": "apple",
}

// Technology color map - placeholder for dynamic colors
export const TECH_COLORS: Record<string, string> = {}
