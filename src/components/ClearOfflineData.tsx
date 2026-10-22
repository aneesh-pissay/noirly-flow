"use client";

import { useEffect } from "react";
import { clearOfflineData } from "@/src/lib/offline";

/** On the login page: nobody is signed in, so no one's saved pages should stay on this device. */
export function ClearOfflineData() {
  useEffect(() => void clearOfflineData(), []);
  return null;
}
