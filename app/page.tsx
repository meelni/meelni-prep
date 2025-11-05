import { CTA } from '@/components/sections/cta';
import { Features } from '@/components/sections/features';
import { Footer } from '@/components/sections/footer';
import { Header } from '@/components/sections/header';
import { Hero } from '@/components/sections/hero';

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />
      <Hero />
      <Features />
      <CTA />
      <Footer />
    </main>
  );
}
