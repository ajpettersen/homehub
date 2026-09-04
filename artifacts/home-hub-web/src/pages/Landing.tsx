import { Link } from 'wouter';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { 
  CheckSquare, 
  Utensils, 
  Wrench, 
  Calendar, 
  Heart, 
  ArrowRight,
  Menu
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProductDemo } from '@/components/ProductDemo';

export default function Landing() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  const y1 = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity1 = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary overflow-x-hidden font-sans">
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
              <Heart className="w-4 h-4 fill-current" />
            </div>
            <span className="font-serif text-2xl font-bold tracking-tight text-foreground">
              HomeHub
            </span>
          </div>
          <Link href="/sign-in" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            Log in
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section 
        ref={containerRef}
        className="relative pt-40 pb-20 px-6 max-w-7xl mx-auto"
      >
        <motion.div 
          style={{ y: y1, opacity: opacity1 }}
          className="max-w-4xl mx-auto text-center space-y-8"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="inline-block py-1.5 px-4 rounded-full bg-primary/10 text-primary font-medium text-sm mb-6 border border-primary/20">
              The household command center
            </span>
            <h1 className="text-5xl md:text-7xl font-serif font-semibold text-foreground tracking-tight leading-[1.1]">
              Run your household,<br className="hidden md:block" /> together.
            </h1>
          </motion.div>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-xl md:text-2xl text-muted-foreground font-light max-w-2xl mx-auto leading-relaxed"
          >
            Chores, meals, maintenance, and schedules. Everything your family needs to run smoothly, in one warm, adaptable place.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
          >
            <Link 
              href="/sign-up" 
              className={cn(buttonVariants({ variant: "default", size: "lg" }), "rounded-full h-14 px-8 text-lg w-full sm:w-auto shadow-lg shadow-primary/20")}
            >
              Get started
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </motion.div>
        </motion.div>

        {/* Video Player Replacement */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mt-20 relative max-w-5xl mx-auto"
        >
          {/* Decorative glow */}
          <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 via-accent/30 to-secondary/30 rounded-[2rem] blur-2xl opacity-50 pointer-events-none" />
          
          <div className="relative rounded-[2rem] overflow-hidden shadow-2xl bg-card border border-border/50 aspect-video ring-1 ring-black/5" style={{ filter: 'drop-shadow(0 25px 25px rgb(0 0 0 / 0.15))' }}>
            <ProductDemo />
          </div>
        </motion.div>
      </section>

      {/* Features Bento Grid */}
      <section className="py-24 px-6 bg-white dark:bg-card/50">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 md:mb-24 text-center md:text-left">
            <h2 className="text-4xl md:text-5xl font-serif font-semibold text-foreground mb-4">
              Chaos, coordinated.
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl font-light mx-auto md:mx-0">
              Designed for how real families actually live. No rigid rules, just gentle structure that keeps everyone in sync.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[24rem]">
            
            {/* Meals Card - Spans 2 columns */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5 }}
              className="md:col-span-2 rounded-3xl bg-[#fdfaf6] dark:bg-card border border-border overflow-hidden relative group p-8 flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 p-8 opacity-20 transition-opacity group-hover:opacity-40 pointer-events-none">
                <Utensils className="w-32 h-32 text-primary" />
              </div>
              <div className="z-10 relative">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
                  <Utensils className="w-6 h-6" />
                </div>
                <h3 className="text-3xl font-serif font-medium text-foreground mb-3">What's for dinner?</h3>
                <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
                  Stop asking the dreaded question. Plan meals for the week, save favorite recipes, and let HomeHub generate the grocery list automatically.
                </p>
              </div>
              {/* Mock UI Element */}
              <div className="z-10 mt-8 bg-white dark:bg-background rounded-2xl p-4 shadow-sm border border-border w-full max-w-md transform transition-transform group-hover:-translate-y-1">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-sm">Tonight</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">Chicken</span>
                </div>
                <div className="font-serif text-lg">Lemon Herb Roasted Chicken</div>
              </div>
            </motion.div>

            {/* Chores Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="rounded-3xl bg-[#f0fdf4] dark:bg-card border border-border overflow-hidden relative group p-8 flex flex-col justify-between"
            >
              <div className="z-10 relative">
                <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center mb-6">
                  <CheckSquare className="w-6 h-6" />
                </div>
                <h3 className="text-3xl font-serif font-medium text-foreground mb-3">Fair sharing</h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Chores that rotate naturally. Keep the house clean without the resentment.
                </p>
              </div>
              <div className="z-10 mt-8 space-y-3 transform transition-transform group-hover:-translate-y-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white dark:bg-background p-3 rounded-xl border border-border flex items-center gap-3">
                    <div className="w-5 h-5 rounded-md border-2 border-muted-foreground/30" />
                    <div className="h-2 w-24 bg-muted rounded-full" />
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Maintenance Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="rounded-3xl bg-[#fffbeb] dark:bg-card border border-border overflow-hidden relative group p-8 flex flex-col justify-between"
            >
              <div className="z-10 relative">
                <div className="w-12 h-12 rounded-2xl bg-accent/20 text-accent-foreground flex items-center justify-center mb-6">
                  <Wrench className="w-6 h-6" />
                </div>
                <h3 className="text-3xl font-serif font-medium text-foreground mb-3">Stay on top of it</h3>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Never forget an air filter or a smoke detector battery again.
                </p>
              </div>
              <div className="z-10 mt-8 space-y-3 transform transition-transform group-hover:-translate-y-1">
                 <div className="bg-white dark:bg-background p-4 rounded-xl border border-border">
                    <div className="text-sm font-medium mb-1">HVAC Filter</div>
                    <div className="text-xs text-destructive">Overdue by 2 days</div>
                 </div>
              </div>
            </motion.div>

            {/* Schedules Card - Spans 2 columns */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="md:col-span-2 rounded-3xl bg-slate-50 dark:bg-card border border-border overflow-hidden relative group p-8 flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 p-8 opacity-10 transition-opacity group-hover:opacity-20 pointer-events-none">
                <Calendar className="w-32 h-32 text-blue-500" />
              </div>
              <div className="z-10 relative">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center mb-6">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-3xl font-serif font-medium text-foreground mb-3">Schedules in sync</h3>
                <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
                  From workouts to school pick-ups. Know who needs to be where, and who is handling what, in a glance.
                </p>
              </div>
              <div className="z-10 mt-8 flex gap-4 overflow-hidden transform transition-transform group-hover:-translate-y-1 relative">
                {/* Fade out on right */}
                <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-slate-50 dark:from-card to-transparent z-20 pointer-events-none" />
                
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, i) => (
                  <div key={day} className={`shrink-0 w-32 h-24 rounded-2xl border border-border p-3 flex flex-col justify-between ${i === 1 ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-900' : 'bg-white dark:bg-background'}`}>
                    <span className="font-medium text-sm text-muted-foreground">{day}</span>
                    {i === 1 && <span className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900 rounded-md px-2 py-1 self-start">Gym 6AM</span>}
                  </div>
                ))}
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Quote Section */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <Heart className="w-12 h-12 text-primary mx-auto mb-8 opacity-50" />
            <h2 className="text-3xl md:text-5xl font-serif font-light text-foreground leading-tight mb-12">
              "A house runs on love and logistics. <br className="hidden md:block" />
              <span className="font-medium text-primary">We help with the logistics.</span>"
            </h2>
            <Link 
              href="/sign-up" 
              className={cn(buttonVariants({ variant: "default", size: "lg" }), "rounded-full h-14 px-8 text-lg shadow-lg")}
            >
              Create your household
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-white dark:bg-background">
        <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
              <Heart className="w-3 h-3 fill-current" />
            </div>
            <span className="font-serif font-medium text-foreground">HomeHub</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} HomeHub. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
