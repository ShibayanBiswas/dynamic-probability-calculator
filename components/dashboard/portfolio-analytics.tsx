"use client";

import { LifecycleAnalyticsGrid } from "@/components/analytics/lifecycle-lab";
import { ScienceLab } from "@/components/analytics/science-lab";
import { LifecycleProductList } from "@/components/dashboard/lifecycle-product-list";
import { AppPage, KpiBand } from "@/components/layout/app-ui";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import { DeferredMount } from "@/components/ui/deferred-mount";
import { useLifecycleFilterPool, useLifecycleIndex } from "@/lib/hooks/use-lifecycle-index";
import { useLifecycleFilter } from "@/lib/hooks/use-lifecycle-filter";
import { useResyncProductToLifecyclePool } from "@/lib/hooks/use-lifecycle-pool-product";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import { useHeadlineKpis } from "@/lib/hooks/use-headline-kpis";

export function PortfolioAnalyticsPage() {
  const { validProducts: masterProducts } = useLifecycleIndex();
  const { asOf } = usePortfolioClock();
  const { filter: lifecycle, setFilter: setLifecycle } = useLifecycleFilter("ongoing");
  const pool = useLifecycleFilterPool(lifecycle);

  useResyncProductToLifecyclePool(pool, lifecycle, asOf);

  const { items: headlineItems, accents: headlineAccents } = useHeadlineKpis();

  return (
    <AppPage dense title="Analytics Lab">
      <KpiBand accents={[...headlineAccents]} items={headlineItems} />
      <div className="mt-6 space-y-4">
        <DeferredMount idleTimeoutMs={120}>
          <HorizontalBand>
            <LifecycleProductList
              activeFilter={lifecycle}
              filter={lifecycle}
              products={masterProducts}
              onFilterChange={setLifecycle}
            />
          </HorizontalBand>
        </DeferredMount>
        <DeferredMount idleTimeoutMs={280}>
          <LifecycleAnalyticsGrid filter={lifecycle} products={masterProducts} />
        </DeferredMount>
        <DeferredMount idleTimeoutMs={700}>
          <ScienceLab filter={lifecycle} products={masterProducts} />
        </DeferredMount>
      </div>
    </AppPage>
  );
}
