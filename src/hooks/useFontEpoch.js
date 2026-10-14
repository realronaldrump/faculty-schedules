import { useEffect, useState } from "react";

/**
 * useFontEpoch - a number that changes whenever web fonts finish loading.
 *
 * Layouts that measure text (canvas widths, element heights) include it in
 * their dependencies so they measure again in Calluna instead of the fallback.
 */
const useFontEpoch = () => {
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return undefined;
    let active = true;
    const bump = () => active && setEpoch((value) => value + 1);
    fonts.ready.then(bump);
    fonts.addEventListener?.("loadingdone", bump);
    return () => {
      active = false;
      fonts.removeEventListener?.("loadingdone", bump);
    };
  }, []);

  return epoch;
};

export default useFontEpoch;
