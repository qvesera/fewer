"use client";

import { useState, useEffect } from "react";

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  hasReducedMotion: boolean;
}

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

/**
 * Detect the user's device type and capabilities.
 * Returns mobile/tablet/desktop flags, touch support, and reduced motion preference.
 */
export function useDevice(): DeviceInfo {
  const [device, setDevice] = useState<DeviceInfo>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouch: false,
    hasReducedMotion: false,
  });

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      // Primary-input check, NOT "has any touchscreen": hybrid laptops with a
      // touchscreen report maxTouchPoints > 0, and "ontouchstart" exists in
      // Chrome even without touch — both made desktops read as touch devices.
      // pointer:coarse is true only when touch is the primary input.
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setDevice({
        isMobile: w < MOBILE_BREAKPOINT,
        isTablet: w >= MOBILE_BREAKPOINT && w < TABLET_BREAKPOINT,
        isDesktop: w >= TABLET_BREAKPOINT,
        isTouch,
        hasReducedMotion: motionQuery.matches,
      });
    };

    update();
    window.addEventListener("resize", update);
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    motionQuery.addEventListener("change", update);

    return () => {
      window.removeEventListener("resize", update);
      motionQuery.removeEventListener("change", update);
    };
  }, []);

  return device;
}
