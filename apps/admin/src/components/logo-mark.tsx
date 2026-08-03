/** The product's mark, exactly as supplied — a black rounded square with a
 * white interlocking glyph. Used wherever a page has no brand context yet
 * (auth-adjacent, onboarding) — once a brand is selected, its own colour and
 * identity carry the page instead. */
export function LogoMark({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="mx-auto"
      aria-hidden
    >
      <rect width="56" height="56" rx="12" fill="black" />
      <g clipPath="url(#logo-mark-clip)">
        <path
          d="M35.9362 43.945L23.6 44L23.5837 37.28L27.1675 37.2762L27.2375 40.4037L35.5912 40.39C37.2287 40.3875 38.465 38.9412 38.4287 37.42C38.3912 35.8912 37.14 34.545 35.4737 34.5362L19.975 34.465C16.5275 34.4487 14.0075 31.27 13.965 28.1025C13.9187 24.6587 16.5062 21.8487 19.9812 21.4837L23.5637 21.4575L23.6012 11.9975L35.8287 12.0387C39.3587 12.0512 41.9762 15.1237 42.0312 18.4162C42.0887 21.8512 39.4037 24.8687 35.8387 25.0312C33.805 25.1237 31.925 25.0675 29.85 25.0562L29.8462 21.4887L35.665 21.4487C37.255 21.4375 38.4262 19.965 38.4337 18.5687C38.4412 16.9837 37.1512 15.6137 35.4925 15.6125L27.2025 15.6062L27.195 30.9325L35.6662 30.9737C39.1625 30.9912 41.9037 33.8825 42.025 37.2287C42.1475 40.585 39.5962 43.9237 35.935 43.94L35.9362 43.945ZM23.5862 30.8987L23.5712 25.1075L20.6825 25.0675C19.0037 25.0437 17.6125 26.2937 17.5625 27.9225C17.5162 29.4275 18.7175 30.8675 20.345 30.9337C21.4462 30.9787 22.4825 30.9575 23.5862 30.8987Z"
          fill="white"
        />
      </g>
      <defs>
        <clipPath id="logo-mark-clip">
          <rect width="32" height="32" fill="white" transform="translate(12 12)" />
        </clipPath>
      </defs>
    </svg>
  );
}
