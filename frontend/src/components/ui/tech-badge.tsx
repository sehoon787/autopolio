import * as React from "react"
import { cn } from "@/lib/utils"
import * as simpleIcons from "simple-icons"

// Custom SVG icons for technologies where simple-icons doesn't look good at small sizes
const CUSTOM_ICONS: Record<string, { svg: string; color: string }> = {
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
const TECH_TO_ICON: Record<string, string> = {
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

// Technology color map - Simple Icons colors + custom colors
const TECH_COLORS: Record<string, string> = {
  // Will be populated dynamically from simple-icons
}

// Get icon and color for a technology
function getTechInfo(tech: string): { icon: string | null; color: string; slug: string | null } {
  // Find the slug for this tech
  const normalizedTech = tech.toLowerCase().replace(/[.\-_\s]/g, '')
  let slug: string | null = null

  // Try exact match first
  if (TECH_TO_ICON[tech]) {
    slug = TECH_TO_ICON[tech]
  } else {
    // Try case-insensitive match
    for (const [key, value] of Object.entries(TECH_TO_ICON)) {
      if (key.toLowerCase() === tech.toLowerCase()) {
        slug = value
        break
      }
    }

    // Try normalized match
    if (!slug) {
      for (const [key, value] of Object.entries(TECH_TO_ICON)) {
        const normalizedKey = key.toLowerCase().replace(/[.\-_\s]/g, '')
        if (normalizedKey === normalizedTech) {
          slug = value
          break
        }
      }
    }
  }

  // Check for custom icons first (for icons that don't look good from simple-icons)
  const customIconKey = normalizedTech
  if (CUSTOM_ICONS[customIconKey]) {
    return {
      icon: CUSTOM_ICONS[customIconKey].svg,
      color: CUSTOM_ICONS[customIconKey].color,
      slug: customIconKey
    }
  }

  // Also check slug for custom icons
  if (slug && CUSTOM_ICONS[slug]) {
    return {
      icon: CUSTOM_ICONS[slug].svg,
      color: CUSTOM_ICONS[slug].color,
      slug
    }
  }

  // Try to get icon from simple-icons
  if (slug) {
    const iconKey = `si${slug.charAt(0).toUpperCase()}${slug.slice(1)}` as keyof typeof simpleIcons
    const iconData = simpleIcons[iconKey]
    if (iconData && 'hex' in iconData) {
      return {
        icon: iconData.svg,
        color: `#${iconData.hex}`,
        slug
      }
    }
  }

  // Try direct lookup by tech name
  const directSlug = tech.toLowerCase().replace(/[.\-_\s]/g, '')
  const directIconKey = `si${directSlug.charAt(0).toUpperCase()}${directSlug.slice(1)}` as keyof typeof simpleIcons
  const directIconData = simpleIcons[directIconKey]
  if (directIconData && 'hex' in directIconData) {
    return {
      icon: directIconData.svg,
      color: `#${directIconData.hex}`,
      slug: directSlug
    }
  }

  // Fallback: generate color from string
  return {
    icon: null,
    color: stringToColor(tech),
    slug: null
  }
}

// Generate a consistent color from a string (for technologies not in the map)
function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  const saturation = 60 + (Math.abs(hash >> 8) % 20)
  const lightness = 45 + (Math.abs(hash >> 16) % 15)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

// Calculate contrasting text color
function getContrastColor(hexColor: string): string {
  // Handle HSL colors
  if (hexColor.startsWith('hsl')) {
    const match = hexColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
    if (match) {
      const l = parseInt(match[3])
      return l > 55 ? '#000000' : '#ffffff'
    }
    return '#ffffff'
  }

  // Handle hex colors
  let color = hexColor.replace('#', '')
  if (color.length === 3) {
    color = color.split('').map(c => c + c).join('')
  }
  const r = parseInt(color.substr(0, 2), 16)
  const g = parseInt(color.substr(2, 2), 16)
  const b = parseInt(color.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

export interface TechBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  tech: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'flat' | 'flat-square' | 'plastic'
  showIcon?: boolean
}

function TechBadge({
  tech,
  size = 'md',
  variant = 'flat',
  showIcon = true,
  className,
  ...props
}: TechBadgeProps) {
  const { icon, color } = getTechInfo(tech)
  const textColor = getContrastColor(color)

  const sizeConfig = {
    sm: {
      height: 18,
      fontSize: 10,
      iconSize: 10,
      paddingX: 6,
      gap: 4,
      borderRadius: variant === 'flat-square' ? 0 : 3,
    },
    md: {
      height: 20,
      fontSize: 11,
      iconSize: 12,
      paddingX: 8,
      gap: 5,
      borderRadius: variant === 'flat-square' ? 0 : 3,
    },
    lg: {
      height: 24,
      fontSize: 12,
      iconSize: 14,
      paddingX: 10,
      gap: 6,
      borderRadius: variant === 'flat-square' ? 0 : 4,
    },
  }

  const config = sizeConfig[size]

  // Shields.io style - gradient for plastic, flat for others
  const getBackgroundStyle = (): React.CSSProperties => {
    if (variant === 'plastic') {
      return {
        background: `linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0.1) 100%), ${color}`,
      }
    }
    return {
      backgroundColor: color,
    }
  }

  // Create icon SVG with proper color
  const renderIcon = () => {
    if (!showIcon || !icon) return null

    // Parse and modify SVG to set fill color and dimensions
    let modifiedSvg = icon

    // Add or replace width attribute
    if (modifiedSvg.includes('width="')) {
      modifiedSvg = modifiedSvg.replace(/width="[^"]*"/, `width="${config.iconSize}"`)
    } else {
      modifiedSvg = modifiedSvg.replace(/<svg/, `<svg width="${config.iconSize}"`)
    }

    // Add or replace height attribute
    if (modifiedSvg.includes('height="')) {
      modifiedSvg = modifiedSvg.replace(/height="[^"]*"/, `height="${config.iconSize}"`)
    } else {
      modifiedSvg = modifiedSvg.replace(/<svg/, `<svg height="${config.iconSize}"`)
    }

    // Add fill color
    modifiedSvg = modifiedSvg.replace(/<svg/, `<svg fill="${textColor}"`)

    return (
      <span
        dangerouslySetInnerHTML={{ __html: modifiedSvg }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: config.iconSize,
          height: config.iconSize,
        }}
      />
    )
  }

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: config.height,
    paddingLeft: config.paddingX,
    paddingRight: config.paddingX,
    gap: config.gap,
    fontSize: config.fontSize,
    fontWeight: 600,
    fontFamily: 'Verdana, Geneva, DejaVu Sans, sans-serif',
    color: textColor,
    borderRadius: config.borderRadius,
    whiteSpace: 'nowrap',
    textShadow: variant === 'plastic'
      ? `0 1px 0 rgba(0,0,0,0.3)`
      : 'none',
    boxShadow: variant === 'default'
      ? `0 1px 2px rgba(0,0,0,0.15)`
      : 'none',
    ...getBackgroundStyle(),
  }

  return (
    <div
      className={cn("select-none", className)}
      style={badgeStyle}
      title={tech}
      {...props}
    >
      {renderIcon()}
      <span style={{ lineHeight: 1 }}>{tech}</span>
    </div>
  )
}

// Legacy exports for backward compatibility
function getTechColor(tech: string): { bg: string; text: string } {
  const { color } = getTechInfo(tech)
  return { bg: color, text: getContrastColor(color) }
}

export { TechBadge, getTechColor, TECH_COLORS, getTechInfo }
