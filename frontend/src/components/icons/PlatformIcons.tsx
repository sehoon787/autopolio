import { SVGProps } from 'react'

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

// Official platform logos (base64 PNG) - provided by user
const SARAMIN_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcBAMAAACAI8KnAAAAKlBMVEVIdu1Idu1Idu09buwxZ+xniu+AnPKftfXY4fv////u8v7K1vohXuu4x/eTgCaKAAAAAnRSTlP19zyBv38AAADKSURBVHgBY2BkQAICDEJKSEARO9fExQjBVXZNL09yhnNdO2fOnNXqBOWqZM4EgWQo13QmGOyBcs/OnNlevXJmCZR7aubcIy7m253g3OmHlVSOwEw+MXPmNRVnuL1mQHNWbTOGcXVuggxedgjmjGMrQfwUuCPNbgAFpsC9oOJiunPmVCOoI1WclJRPzZwG5XrMKnbxiYTJKmfOnNVbvRKmVzkS4oU7UKOOg3mzYfaqRAOtmVUCDw0TtfLyZCdE0Cm7QIMOfzijRgoDAO+SZnQ+ZiSwAAAAAElFTkSuQmCC'
const WANTED_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAACgklEQVR4Ae3WQ3hcYQBG4VtjVXtXb2rbtm27sZ3Utm3btm3bNk/ny33imdrt4iwunry/MjNG2W6Vfmr/wV8HZlhF6/Sr6FNwOT1U9aVmHRcRqHrOJ+d3AwWlWw0q/3IzC6bossjMbwF0HEaS7wImW8s6YZlWsTDXcvwjz9B3AXcFapbfDUy4DuKsp7y15z0msX/E3B8AxlpNLWvPF83iyMzZsHIKub4LGH0dq6J/Atw04yeCh2Zw+IeA2kNb4OnpvDm8nMyfBHWUqzqzpKEru1192alG9WDngn7s3DaYnddHsF1/TD0Y/+Q0gw/sUPSYthXHlpupH33no9GXn9+bC+8bljqm69AaxV9Eo7iVIoCF7dhR2gGqOUFXLwgKgFE9wQJiAbk0Cpj83mzsYxh+DgZshsAx4NAcGkTTPfN5uTK6jprwzuXjBYM5ulEnQydQBbqxWfswriflVw80ezf0XGkd+5bDYcaIF766Vnh4l0fVjFWckbdOIrBNUCdda1aoBoarpWchaOgexu1AU4Fx24DRCu8v3UMEapZDD2WP8qxzpZQhqAahm6FotNagjNb0/ZJTysAdR7TM1kBFo1jdBGpPdeOTqDGLNZZsg/3XHf0oqGVukggtq25YRY0OqAHhQWOEDVAntvdC6DG9pdXnzVJ2EBg6Q2uoCZp7aoxjgTHKNigInVr/oedCTmNIuqZN1vu0yhi6h7ZRBwjOn/fGQNugQph3L/DwuIJzx5bY1c9P5zLNQ7FWmc6EntJPogKVbdA8jZ7eZ3Fz0P+nWdfK0LEo+kDQTD8JKsODRibIQ6MHaT71PpqdPoHsGhyhW7XVmuUXf5YaPpQxfMnx/1eb+g9+AJ39lkCQdo8RAAAAAElFTkSuQmCC'
const REMEMBER_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAVFBMVEUAAAAmJiR7e3d2dnNvb2tTU1D///////b///r///jg4NmHh4NQUE339+/4+PD6+vLo6OHV1c6np6JpaWXv7+e8vLbFxb/l5d6Li4ebm5YcHBteXlsQp5ECAAAAk0lEQVR4AcWSRRLDMBAExZg1s///z+z6Epyzx6CuarGk7os29orzf6QPkZNCzrnUb/nIRE2rXNdSm/u/koEtxQHIMTIQkIolJSSnhgFJGXP+Lxna2CkglzANCkkJkPNaSlmAtKlt2zSCbteWqC1AGi4pW7y31HZA1ihNK9w+punnsHMS2phi2N/lcUoulAtjGG/KE7fpCxRyfqaQAAAAAElFTkSuQmCC'
const JUMPIT_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAVFBMVEVHcEwAAAAAAAAAAAAAAAAAAAAzih5O0S5d+jZZ7zQAAAASMAokYRUyMjJwcHBdXV2FhYX////X19eysrKenp7n5+caGhr29vZBQUHMzMxDQ0Pc3NxQxHkmAAAAC3RSTlMACZjt/5D//////ugd1ikAAADFSURBVHgBhdMHEoQgEETRQVrMOev977miVbChZb+V55lBREUa4OlYnXM6dkRJjGCRkAuYJDHuEkLm6ZkTBGSpDXf5Lyiy1B4c+CtkAVBaUAYACmMKcOCjoKpdDQVt5+opGDwYKZg8qBmY++lssfNlZeBuvACeQW/BFgD+GTmY/TNyUF+PsHPgvsWEZ7BZsFGwLy1QdbaWgcZeervmS0VA2/lGhMEGBtAc93ga8ZFoOFK3bdvM+EhLhGDx/80rKtbIadCRkhfTQBqEdU5mJwAAAABJRU5ErkJggg=='

/**
 * 사람인 (Saramin) - Korean job portal
 * Official color: #4876ED (from logo)
 */
export function SaraminIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="48" height="48" rx="8" fill="#4876ED" />
      <image
        href={SARAMIN_LOGO}
        x="10"
        y="10"
        width="28"
        height="28"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  )
}

/**
 * 리멤버 (Remember) - Business networking app
 * Background: #000000 (black)
 */
export function RememberIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="48" height="48" rx="8" fill="#000000" />
      <image
        href={REMEMBER_LOGO}
        x="10"
        y="10"
        width="28"
        height="28"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  )
}

/**
 * 점핏 (Jumpit) - IT job portal
 * Official color: #000 background
 */
export function JumpitIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="48" height="48" rx="8" fill="#000000" />
      <image
        href={JUMPIT_LOGO}
        x="8"
        y="8"
        width="32"
        height="32"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  )
}

/**
 * 원티드 (Wanted) - Tech job portal
 * Official color: #3366ff
 * Background: white, logo centered to fit badge
 */
export function WantedIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="48" height="48" rx="8" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
      <image
        href={WANTED_LOGO}
        x="10"
        y="10"
        width="28"
        height="28"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  )
}

/**
 * Generic platform icon for unknown platforms
 */
export function GenericPlatformIcon({ size = 24, color = '#666', ...props }: IconProps & { color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="48" height="48" rx="8" fill={color} />
      <path
        d="M16 12H28L34 18V36H16V12Z"
        stroke="white"
        strokeWidth="2"
        fill="none"
      />
      <path d="M28 12V18H34" stroke="white" strokeWidth="2" />
      <line x1="20" y1="24" x2="30" y2="24" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="28" x2="30" y2="28" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="32" x2="26" y2="32" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Get platform icon component by platform key
 */
export function getPlatformIcon(platformKey: string, size: number = 48) {
  switch (platformKey) {
    case 'saramin':
      return <SaraminIcon size={size} />
    case 'remember':
      return <RememberIcon size={size} />
    case 'jumpit':
      return <JumpitIcon size={size} />
    case 'wanted':
      return <WantedIcon size={size} />
    default:
      return <GenericPlatformIcon size={size} />
  }
}

export default {
  SaraminIcon,
  RememberIcon,
  JumpitIcon,
  WantedIcon,
  GenericPlatformIcon,
  getPlatformIcon,
}
