"use client";

import { createContext, useContext } from "react";

// Lets any P&L section open a deal in the drawer hosted by the P&L layout.
export const PnlShellCtx = createContext<{ openLead: (id: string) => void }>({ openLead: () => {} });
export const usePnlShell = () => useContext(PnlShellCtx);
