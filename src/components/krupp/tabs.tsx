'use client';
/**
 * KRUPP CAPITAL MK-III — Workspace Tab Registry
 *
 * Single source of truth for the 14-tab matrix (LONDON EDGE landing terminal
 * + 13 institutional desks). Extracted from Shell.tsx so that shared surfaces
 * (workspace command palette, help overlays) can enumerate desks without a
 * circular import back into the Shell.
 *
 * NOTE: tab indices are load-bearing — the desk hotkeys (L / 1-9 / 0 / Q / W
 * / E) and the persisted 'krupp-workspace'.activeTab both encode this order.
 * Never reorder TABS.
 */
import {
  Activity, Sigma, TrendingUp, Landmark, Coins, Flame, DollarSign,
  Building2, Layers, Droplets, Bitcoin, Radar, ServerCog, Zap,
} from 'lucide-react';
import LondonEdge from '@/components/london/LondonEdge';
import Desk01Volatility from './desks/Desk01Volatility';
import Desk02Options from './desks/Desk02Options';
import Desk03IndexFutures from './desks/Desk03IndexFutures';
import Desk04Bonds from './desks/Desk04Bonds';
import Desk05Metals from './desks/Desk05Metals';
import Desk06Energies from './desks/Desk06Energies';
import Desk07Fx from './desks/Desk07Fx';
import Desk08Stocks from './desks/Desk08Stocks';
import Desk09Etf from './desks/Desk09Etf';
import Desk10Liquidity from './desks/Desk10Liquidity';
import Desk11Crypto from './desks/Desk11Crypto';
import Desk12StatArb from './desks/Desk12StatArb';
import Desk13Infra from './desks/Desk13Infra';

export type TabDef = {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  accent: string;
  bar: string;
  Comp: React.ComponentType;
  deskNo?: number; // 1..13 for the 13-desk matrix; undefined for the landing terminal
};

export const TABS: TabDef[] = [
  {
    label: 'LONDON EDGE', icon: Zap,
    accent: 'text-kaccent-soft', bar: 'bg-kaccent',
    Comp: LondonEdge,
  },
  { label: 'VOL COMPLEX', icon: Activity, accent: 'text-kaccent-soft', bar: 'bg-kaccent', Comp: Desk01Volatility, deskNo: 1 },
  { label: 'OPTIONS & RISK', icon: Sigma, accent: 'text-violet-300', bar: 'bg-violet-400', Comp: Desk02Options, deskNo: 2 },
  { label: 'INDEX FUTURES', icon: TrendingUp, accent: 'text-emerald-300', bar: 'bg-emerald-400', Comp: Desk03IndexFutures, deskNo: 3 },
  { label: 'BOND FUTURES', icon: Landmark, accent: 'text-amber-300', bar: 'bg-amber-400', Comp: Desk04Bonds, deskNo: 4 },
  { label: 'METALS', icon: Coins, accent: 'text-yellow-300', bar: 'bg-yellow-400', Comp: Desk05Metals, deskNo: 5 },
  { label: 'ENERGIES', icon: Flame, accent: 'text-orange-300', bar: 'bg-orange-400', Comp: Desk06Energies, deskNo: 6 },
  { label: 'FX FUTURES', icon: DollarSign, accent: 'text-teal-300', bar: 'bg-teal-400', Comp: Desk07Fx, deskNo: 7 },
  { label: 'STOCKS', icon: Building2, accent: 'text-kaccent-soft', bar: 'bg-kaccent', Comp: Desk08Stocks, deskNo: 8 },
  { label: 'SPDR & MACRO ETF', icon: Layers, accent: 'text-violet-300', bar: 'bg-violet-400', Comp: Desk09Etf, deskNo: 9 },
  { label: 'CENTRAL BANK LIQ', icon: Droplets, accent: 'text-emerald-300', bar: 'bg-emerald-400', Comp: Desk10Liquidity, deskNo: 10 },
  { label: 'CRYPTO L3 MBO', icon: Bitcoin, accent: 'text-amber-300', bar: 'bg-amber-400', Comp: Desk11Crypto, deskNo: 11 },
  { label: 'STAT ARB & SPREADS', icon: Radar, accent: 'text-rose-300', bar: 'bg-rose-400', Comp: Desk12StatArb, deskNo: 12 },
  { label: 'SYSTEM INFRA', icon: ServerCog, accent: 'text-zinc-300', bar: 'bg-zinc-400', Comp: Desk13Infra, deskNo: 13 },
];

/** Desk hotkey (for tooltips / help cards): 0 → L, 1-9 → 1-9, 10 → 0, 11-13 → Q/W/E */
export const DESK_HOTKEY: Record<number, string> = {
  0: 'L', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5',
  6: '6', 7: '7', 8: '8', 9: '9', 10: '0', 11: 'Q', 12: 'W', 13: 'E',
};
