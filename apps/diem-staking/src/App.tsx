// Top-level page composition. Thin — all interactivity lives in StakeCard,
// all presentation in the Layout components. This file's job is:
//   1. Compute the top-line derived values (APY, alpha-strip cap display)
//   2. Hand them down to the card + layout
//   3. Render the static sections in the order the design specifies

import { useMemo } from 'react';

import {
  useDiemPrice,
  usePoolStats,
} from './lib/hooks';
import {
  AlphaStrip,
  ClaimBanner,
  DualCards,
  FAQ,
  Footer,
  Hero,
  HowItWorks,
  Nav,
} from './components/Layout';
import { StakeCard } from './components/StakeCard';
import { fmtNum, toDiemNumber } from './lib/format';
import { DAYS_PER_YEAR } from './lib/epoch';
import { DIEM_STAKING_PROXY, isAddressSet } from './lib/addresses';
import { ALPHA_MAX_TOTAL_STAKE_DIEM_BASE, MAX_USDC_PER_DIEM_PER_DAY } from './lib/protocol';

export function App() {
  const diemPrice = useDiemPrice();
  const pool = usePoolStats();

  // Max displayed rate = fixed 0.5 USDC per DIEM per day, annualized,
  // divided by the live DIEM price.
  const apy = useMemo(() => {
    if (diemPrice == null || diemPrice <= 0) return 0;
    return ((MAX_USDC_PER_DIEM_PER_DAY * DAYS_PER_YEAR) / diemPrice) * 100;
  }, [diemPrice]);

  // Prefer the live on-chain value. Fall back to the expected alpha cap
  // (100 DIEM) when the read hasn't returned yet or the proxy isn't deployed,
  // so the AlphaStrip renders the correct cap from the first paint. Only
  // treat an explicit on-chain `0` as "uncapped" (owner raised / removed).
  const maxStakeDisplay = useMemo(() => {
    const cap = pool.maxTotalStake ?? ALPHA_MAX_TOTAL_STAKE_DIEM_BASE;
    if (cap === 0n) return null;
    return fmtNum(toDiemNumber(cap));
  }, [pool.maxTotalStake]);

  const proxyAddress = isAddressSet(DIEM_STAKING_PROXY) ? DIEM_STAKING_PROXY : null;

  return (
    <>
      <AlphaStrip maxStakeDisplay={maxStakeDisplay} />
      <Nav />
      <main>
        <Hero diemPrice={diemPrice} apy={apy} />
        <StakeCard diemPrice={diemPrice} apy={apy} />
        <ClaimBanner />
        <HowItWorks />
        <DualCards />
        <FAQ />
      </main>
      <Footer proxyAddress={proxyAddress} />
    </>
  );
}
