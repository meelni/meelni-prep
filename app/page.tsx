import { Blog } from '@/components/sections/blog';
import { CTA } from '@/components/sections/cta';
import { Examples } from '@/components/sections/examples';
import { Features } from '@/components/sections/features';
import { Footer } from '@/components/sections/footer';
import { Pricing } from '@/components/sections/pricing';
import { HomeWrapper } from '@/components/home-wrapper';

export default function Home() {
  return (
    <main className="flex flex-col">
      <HomeWrapper>
        {/* Social proof section removed - will add when we have real testimonials */}
        {/* <Logos /> */}
      <div className="mt-20">
        <Examples />
      </div>
      <div className="mt-20">
        <Features />
      </div>
      <div className="mt-20">
        <Pricing />
      </div>
      <div className="mt-20">
        <Blog />
      </div>
        <div className="mt-20">
          <CTA />
        </div>
        <Footer />
      </HomeWrapper>
    </main>
  );
}
