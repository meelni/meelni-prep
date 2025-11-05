import { Blog } from '@/components/sections/blog';
import { Community } from '@/components/sections/community';
import { CTA } from '@/components/sections/cta';
import { Examples } from '@/components/sections/examples';
import { Features } from '@/components/sections/features';
import { Footer } from '@/components/sections/footer';
import { Header } from '@/components/sections/header';
import { Hero } from '@/components/sections/hero';
import { Logos } from '@/components/sections/logos';
import { Pricing } from '@/components/sections/pricing';
import { Statistics } from '@/components/sections/statistics';
import { Testimonials } from '@/components/sections/testimonials';
import { UseCases } from '@/components/sections/use-cases';

export default function Home() {
  return (
    <main className="flex flex-col">
      <Header />
      <Hero />
      {/* No gap between Hero and Logos */}
      <Logos />
      <div className="mt-20">
        <Examples />
      </div>
      <div className="mt-20">
        <UseCases />
      </div>
      <div className="mt-20">
        <Features />
      </div>
      <div className="mt-20">
        <Statistics />
      </div>
      <div className="mt-20">
        <Testimonials />
      </div>
      <div className="mt-20">
        <Pricing />
      </div>
      <div className="mt-20">
        <Community />
      </div>
      <div className="mt-20">
        <Blog />
      </div>
      <div className="mt-20">
        <CTA />
      </div>
      <Footer />
    </main>
  );
}
