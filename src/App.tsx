/**
 * DISTRICT - DC Running Community Landing Page
 *
 * This is the main application component for the DISTRICT running brand.
 * It creates demand and builds a waitlist for a DC-based running community
 * that rewards runners with exclusive gear based on miles logged via Strava.
 *
 * Key Features:
 * - Waitlist signup system
 * - Strava integration for mile tracking
 * - User authentication (signup/signin)
 * - Interactive scroll-based "Mall laps" counter
 * - Premium visual design inspired by Bandit Running
 * - Community-focused messaging and social proof
 */

import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { X } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import Dashboard from './components/Dashboard';

function App() {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  // Scroll tracking state - calculates "laps around the mall" based on scroll distance
  const [laps, setLaps] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0); // Progress bar at top (0-1)
  const [showStickyCta, setShowStickyCta] = useState(false); // Show floating CTA after scrolling

  // Waitlist form state
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Authentication state
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFirstName, setAuthFirstName] = useState('');
  const [authError, setAuthError] = useState('');

  // View state - toggle between landing page and dashboard
  const [showHome, setShowHome] = useState(false);

  // New state for enhanced features
  const [showMemberCount, setShowMemberCount] = useState(false);
  const [memberCount] = useState(247); // Hardcoded for now, can be dynamic

  // ============================================================================
  // AUTHENTICATION EFFECTS
  // ============================================================================

  /**
   * Initialize authentication state on component mount
   * Sets up listener for auth state changes (login/logout)
   */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ============================================================================
  // SCROLL TRACKING EFFECTS
  // ============================================================================

  /**
   * Creative scroll tracker that converts scroll distance into "Mall laps"
   * The National Mall loop in DC is approximately 5 miles
   * This creates an engaging, DC-specific metric for user engagement
   */
  useEffect(() => {
    const MALL_LOOP_MILES = 5; // National Mall loop distance
    const PIXELS_PER_MILE = 5280 * 12 / 96; // Convert miles to pixels (assuming 96 DPI)
    let totalScrollDistance = 0;
    let lastScrollPosition = 0;

    const handleScroll = () => {
      const currentScrollPosition = window.scrollY;
      const scrollDelta = Math.abs(currentScrollPosition - lastScrollPosition);

      // Accumulate total scroll distance (up and down)
      totalScrollDistance += scrollDelta;
      lastScrollPosition = currentScrollPosition;

      // Calculate laps around the National Mall
      const scrollInMiles = totalScrollDistance / (PIXELS_PER_MILE * 100);
      const calculatedLaps = scrollInMiles / MALL_LOOP_MILES;
      setLaps(calculatedLaps);

      // Calculate scroll progress for top bar (0 to 1)
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = (winScroll / height);
      setScrollProgress(scrolled);

      // Show sticky CTA after user scrolls down 800px
      setShowStickyCta(window.scrollY > 800);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  /**
   * Animate member count on mount
   */
  useEffect(() => {
    const timer = setTimeout(() => setShowMemberCount(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // ============================================================================
  // AUTHENTICATION HANDLERS
  // ============================================================================

  /**
   * Handle user authentication (both signup and signin)
   * Creates user profile in database on signup
   */
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setIsSubmitting(true);

    try {
      if (authMode === 'signup') {
        // Create new user account
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.toLowerCase().trim(),
          password: authPassword,
        });

        if (error) throw error;

        // Create user profile in database
        if (data.user) {
          await supabase.from('users').insert({
            id: data.user.id,
            email: authEmail.toLowerCase().trim(),
            first_name: authFirstName.trim(),
          });

          // Reset form and close modal
          setShowAuthModal(false);
          setAuthEmail('');
          setAuthPassword('');
          setAuthFirstName('');
        }
      } else {
        // Sign in existing user
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.toLowerCase().trim(),
          password: authPassword,
        });

        if (error) throw error;

        setShowAuthModal(false);
        setAuthEmail('');
        setAuthPassword('');
      }
    } catch (error: any) {
      setAuthError(error.message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Sign out current user
   */
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // ============================================================================
  // WAITLIST HANDLERS
  // ============================================================================

  /**
   * Add email to waitlist
   * Handles duplicate entries gracefully
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage('');

    try {
      const { error } = await supabase
        .from('waitlist')
        .insert([
          {
            email: email.toLowerCase().trim(),
          }
        ]);

      if (error) {
        // Handle duplicate email (PostgreSQL unique constraint violation)
        if (error.code === '23505') {
          setSubmitMessage('You\'re already on the waitlist!');
        } else {
          setSubmitMessage('Something went wrong. Please try again.');
        }
      } else {
        // Success - show modal prompting Strava connection
        setEmail('');
        setSubmitMessage('');
        setShowSuccessModal(true);
      }
    } catch (err) {
      setSubmitMessage('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // STRAVA INTEGRATION
  // ============================================================================

  /**
   * Initiate Strava OAuth connection
   * Requires user to be authenticated first
   */
  function handleConnectStrava() {
    if (!user) {
      // User must create account before connecting Strava
      setShowAuthModal(true);
      setAuthMode('signup');
    } else {
      // Redirect to Strava OAuth flow
      window.location.href = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strava-connect?userId=${user.id}`;
    }
  }

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl font-light text-[#ff6b35] animate-pulse tracking-wider">DISTRICT</div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // DASHBOARD VIEW (for authenticated users)
  // ============================================================================

  if (user && !showHome) {
    return <Dashboard userId={user.id} onViewHome={() => setShowHome(true)} />;
  }

  // ============================================================================
  // MAIN LANDING PAGE RENDER
  // ============================================================================

  return (
    <div className="bg-[#fafafa] text-black overflow-x-hidden font-light">
      {/* ====================================================================== */}
      {/* SCROLL PROGRESS BAR */}
      {/* ====================================================================== */}
      <div
        className="fixed top-0 left-0 h-[3px] bg-[#ff6b35] z-[1001] origin-left transition-transform duration-100"
        style={{ transform: `scaleX(${scrollProgress})`, width: '100%' }}
      />

      {/* ====================================================================== */}
      {/* NAVIGATION */}
      {/* ====================================================================== */}
      <nav className="fixed top-0 left-0 right-0 px-10 py-6 flex justify-between items-center z-[100] bg-[#fafafa]/95 backdrop-blur-md border-b border-[#e5e5e5]">
        <div className="text-lg font-medium tracking-wide">DISTRICT</div>
        <div className="flex gap-8 items-center text-[13px] tracking-wide">
          <div className="hidden md:flex gap-8">
            <a href="#concept" className="text-black no-underline transition-opacity hover:opacity-50">Concept</a>
            <a href="#join" className="text-black no-underline transition-opacity hover:opacity-50">Join</a>
            <a href="#story" className="text-black no-underline transition-opacity hover:opacity-50">Story</a>
            <a href="#community" className="text-black no-underline transition-opacity hover:opacity-50">Community</a>
          </div>
          {user && (
            <button
              onClick={() => setShowHome(false)}
              className="px-8 py-3 text-[13px] tracking-wider uppercase bg-black text-[#fafafa] border border-black transition-all hover:bg-[#ff6b35] hover:border-[#ff6b35] font-medium"
            >
              Dashboard
            </button>
          )}
        </div>
      </nav>

      {/* ====================================================================== */}
      {/* HERO SECTION */}
      {/* ====================================================================== */}
      <section className="min-h-screen flex flex-col justify-center items-center text-center px-10 pt-32 pb-32 bg-[#fafafa] relative overflow-hidden">
        {/* Background decorative element */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-black rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-black rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-black rounded-full" />
        </div>

        <div className="text-sm tracking-[2px] uppercase text-[#666] mb-6">Washington DC</div>
        <h1 className="text-[clamp(64px,12vw,160px)] font-light tracking-[-4px] mb-6 leading-[0.9] animate-[fadeInUp_1s_ease-out] relative">
          DISTRICT
        </h1>
        <p className="text-lg text-[#333] max-w-[520px] mx-auto mb-12 leading-relaxed font-light">
          Premium running gear released monthly. Access determined by miles logged. Connect Strava, put in the work, earn exclusive pieces.
        </p>

        {/* Member count badge */}
        <div className={`mb-8 transition-all duration-700 ${showMemberCount ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white text-xs tracking-wider uppercase">
            <div className="w-2 h-2 bg-[#ff6b35] rounded-full animate-pulse" />
            <span>{memberCount}+ Runners Waiting</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <a
            href="#join"
            className="px-8 py-4 text-[13px] tracking-wider uppercase bg-black text-[#fafafa] border border-black transition-all hover:bg-[#ff6b35] hover:border-[#ff6b35] font-medium no-underline"
          >
            Join Waitlist
          </a>
          <a
            href="#concept"
            className="px-8 py-4 text-[13px] tracking-wider uppercase bg-transparent text-black border border-[#e5e5e5] transition-all hover:border-black font-medium no-underline"
          >
            Learn More
          </a>
        </div>
      </section>

      {/* ====================================================================== */}
      {/* MARQUEE - ACCESS TIERS */}
      {/* ====================================================================== */}
      <div className="bg-black text-white py-4 overflow-hidden whitespace-nowrap relative">
        <div className="inline-block animate-[marquee_80s_linear_infinite] pl-full">
          <span className="text-xs tracking-wider uppercase px-6">100+ Miles = Premium Access</span>
          <span className="text-[#ff6b35] px-4">•</span>
          <span className="text-xs tracking-wider uppercase px-6">50+ Miles = Basic Access</span>
          <span className="text-[#ff6b35] px-4">•</span>
          <span className="text-xs tracking-wider uppercase px-6">150+ Miles = Elite Access</span>
          <span className="text-[#ff6b35] px-4">•</span>
          <span className="text-xs tracking-wider uppercase px-6">Monthly Drops</span>
          <span className="text-[#ff6b35] px-4">•</span>
          <span className="text-xs tracking-wider uppercase px-6">DC Running Community</span>
          <span className="text-[#ff6b35] px-4">•</span>
          <span className="text-xs tracking-wider uppercase px-6">Strava Verified</span>
          <span className="text-[#ff6b35] px-4">•</span>
        </div>
        {/* Duplicate for seamless loop */}
        <div className="inline-block animate-[marquee_80s_linear_infinite]" aria-hidden="true">
          <span className="text-xs tracking-wider uppercase px-6">100+ Miles = Premium Access</span>
          <span className="text-[#ff6b35] px-4">•</span>
          <span className="text-xs tracking-wider uppercase px-6">50+ Miles = Basic Access</span>
          <span className="text-[#ff6b35] px-4">•</span>
          <span className="text-xs tracking-wider uppercase px-6">150+ Miles = Elite Access</span>
          <span className="text-[#ff6b35] px-4">•</span>
          <span className="text-xs tracking-wider uppercase px-6">Monthly Drops</span>
          <span className="text-[#ff6b35] px-4">•</span>
          <span className="text-xs tracking-wider uppercase px-6">DC Running Community</span>
          <span className="text-[#ff6b35] px-4">•</span>
          <span className="text-xs tracking-wider uppercase px-6">Strava Verified</span>
          <span className="text-[#ff6b35] px-4">•</span>
        </div>
      </div>

      {/* ====================================================================== */}
      {/* HOW IT WORKS SECTION */}
      {/* ====================================================================== */}
      <section className="py-32 px-10 max-w-[1400px] mx-auto" id="concept">
        <h2 className="text-[clamp(48px,8vw,96px)] font-light mb-20 tracking-[-2px] text-center">How It Works</h2>

        {/* Main 3-step process */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-[#e5e5e5] border border-[#e5e5e5]">
          <div className="bg-[#fafafa] p-16 text-center transition-all hover:bg-white">
            <div className="text-6xl mb-6">01</div>
            <h3 className="text-2xl font-medium mb-4 tracking-tight">Connect Strava</h3>
            <p className="text-[15px] leading-relaxed text-[#666] font-light">
              Link your account and join our DC runner community. We verify your miles automatically through Strava's API.
            </p>
          </div>
          <div className="bg-[#fafafa] p-16 text-center transition-all hover:bg-white">
            <div className="text-6xl mb-6">02</div>
            <h3 className="text-2xl font-medium mb-4 tracking-tight">Log Your Miles</h3>
            <p className="text-[15px] leading-relaxed text-[#666] font-light">
              Run anywhere in the DMV. Mall loops, Rock Creek, Georgetown waterfront. Every mile counts toward your monthly total.
            </p>
          </div>
          <div className="bg-[#fafafa] p-16 text-center transition-all hover:bg-white">
            <div className="text-6xl mb-6">03</div>
            <h3 className="text-2xl font-medium mb-4 tracking-tight">Unlock Drops</h3>
            <p className="text-[15px] leading-relaxed text-[#666] font-light">
              Hit mileage tiers to access monthly releases. 50 miles for basic. 100+ for premium. Top runners get exclusive colorways.
            </p>
          </div>
        </div>

        {/* Feature cards with hover effects */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
          <div className="bg-white p-12 border border-[#e5e5e5] transition-all duration-400 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] cursor-pointer relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#ff6b35] scale-x-0 origin-left transition-transform duration-400 group-hover:scale-x-100" />
            <h3 className="text-xl font-medium mb-3">Technical Performance</h3>
            <p className="text-sm text-[#666] leading-relaxed">
              Premium fabrics tested on DC streets. Moisture-wicking, reflective details, strategic ventilation.
            </p>
          </div>
          <div className="bg-white p-12 border border-[#e5e5e5] transition-all duration-400 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] cursor-pointer relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#ff6b35] scale-x-0 origin-left transition-transform duration-400 group-hover:scale-x-100" />
            <h3 className="text-xl font-medium mb-3">Locally Made</h3>
            <p className="text-sm text-[#666] leading-relaxed">
              Designed in DC, inspired by the Mall, Rock Creek, and every route that defines our running community.
            </p>
          </div>
          <div className="bg-white p-12 border border-[#e5e5e5] transition-all duration-400 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)] cursor-pointer relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#ff6b35] scale-x-0 origin-left transition-transform duration-400 group-hover:scale-x-100" />
            <h3 className="text-xl font-medium mb-3">Limited Releases</h3>
            <p className="text-sm text-[#666] leading-relaxed">
              Small batch drops. Once it's gone, it's gone. Exclusivity earned through miles, not hype.
            </p>
          </div>
        </div>
      </section>

      {/* ====================================================================== */}
      {/* MOTIVATIONAL SPLIT SECTION */}
      {/* ====================================================================== */}
      <div className="bg-black my-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[70vh]">
          <div className="flex flex-col justify-center p-20 text-white">
            <h2 className="text-[clamp(36px,6vw,64px)] font-light mb-8 tracking-[-2px]">Earn Your Gear</h2>
            <p className="text-base leading-relaxed text-[#aaa] font-light max-w-[480px] mb-8">
              No raffles. No bots. No hype. Just running. We believe the best way to earn exclusive gear is to put in the miles. Our system is built on verification, not speculation.
            </p>
            <div className="space-y-4 max-w-[480px]">
              <div className="flex items-center gap-4 text-sm">
                <div className="w-2 h-2 bg-[#ff6b35] rounded-full flex-shrink-0" />
                <span className="text-[#999]">Fair access based on effort</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="w-2 h-2 bg-[#ff6b35] rounded-full flex-shrink-0" />
                <span className="text-[#999]">Verified through Strava data</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="w-2 h-2 bg-[#ff6b35] rounded-full flex-shrink-0" />
                <span className="text-[#999]">Community over commerce</span>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-[#ff6b35] to-[#ff8555] flex items-center justify-center relative overflow-hidden p-20">
            <svg viewBox="0 0 400 400" className="w-full h-full max-w-[400px] max-h-[400px]">
              <path
                d="M 200 30 L 370 200 L 200 370 L 50 220 L 48 200 L 47 180 L 48 160 L 51 140 L 57 120 L 66 102 L 78 86 L 93 73 L 110 64 L 128 58 L 147 56 L 166 59 L 183 67 L 196 80 Z"
                fill="none"
                stroke="rgba(0,0,0,0.15)"
                strokeWidth="6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* ====================================================================== */}
      {/* NEW: COMMUNITY STATS SECTION (Bandit-inspired) */}
      {/* ====================================================================== */}
      <section className="py-32 px-10 bg-white" id="community">
        <div className="max-w-[1400px] mx-auto">
          <h2 className="text-[clamp(36px,6vw,72px)] font-light mb-20 tracking-[-2px] text-center">Built on Community</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-20">
            <div className="text-center p-8 border border-[#e5e5e5] transition-all hover:border-black">
              <div className="text-5xl font-light mb-4 text-[#ff6b35]">{memberCount}+</div>
              <div className="text-sm uppercase tracking-wider text-[#666]">Runners Waiting</div>
            </div>
            <div className="text-center p-8 border border-[#e5e5e5] transition-all hover:border-black">
              <div className="text-5xl font-light mb-4 text-[#ff6b35]">5,280+</div>
              <div className="text-sm uppercase tracking-wider text-[#666]">Miles Logged</div>
            </div>
            <div className="text-center p-8 border border-[#e5e5e5] transition-all hover:border-black">
              <div className="text-5xl font-light mb-4 text-[#ff6b35]">100%</div>
              <div className="text-sm uppercase tracking-wider text-[#666]">DC Based</div>
            </div>
            <div className="text-center p-8 border border-[#e5e5e5] transition-all hover:border-black">
              <div className="text-5xl font-light mb-4 text-[#ff6b35]">0</div>
              <div className="text-sm uppercase tracking-wider text-[#666]">Raffles Needed</div>
            </div>
          </div>

          {/* Testimonial section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-[#fafafa] p-12 border border-[#e5e5e5]">
              <div className="text-4xl mb-6">"</div>
              <p className="text-lg font-light mb-6 leading-relaxed">
                Finally, a brand that rewards the work you put in. No more competing with bots for drops.
              </p>
              <div className="text-sm text-[#666] uppercase tracking-wider">— Sarah K., Georgetown</div>
            </div>
            <div className="bg-[#fafafa] p-12 border border-[#e5e5e5]">
              <div className="text-4xl mb-6">"</div>
              <p className="text-lg font-light mb-6 leading-relaxed">
                Love seeing my miles translate directly to access. This is how running brands should operate.
              </p>
              <div className="text-sm text-[#666] uppercase tracking-wider">— Marcus D., Adams Morgan</div>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================== */}
      {/* NEW: MOTIVATIONAL MARQUEE */}
      {/* ====================================================================== */}
      <div className="bg-[#ff6b35] text-white py-8 overflow-hidden whitespace-nowrap relative">
        <div className="inline-block animate-[marquee_60s_linear_infinite]">
          {[...Array(15)].map((_, i) => (
            <span key={i} className="inline-block">
              <span className="text-base tracking-[3px] uppercase px-12 font-medium">
                Run More • Earn More • Be More
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ====================================================================== */}
      {/* WAITLIST SIGNUP SECTION */}
      {/* ====================================================================== */}
      <section className="bg-black py-0 px-0" id="join">
        {/* Animated banner */}
        <div className="overflow-hidden whitespace-nowrap relative border-t-2 border-b-2 border-white">
          <div className="inline-block animate-[marquee_60s_linear_infinite]">
            {[...Array(20)].map((_, i) => (
              <span key={i} className="inline-block">
                <span className="text-base sm:text-lg tracking-[4px] uppercase px-12 py-6 inline-block text-white font-medium">
                  JOIN THE WAITLIST FOR EARLY ACCESS →
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="px-6 sm:px-10 lg:px-20 py-20 sm:py-32">
          <div className="max-w-[1400px] mx-auto">
            {/* Email signup form */}
            <form onSubmit={handleSubmit} className="mb-16">
              <div className="flex flex-col lg:flex-row gap-0 border-4 border-white">
                <input
                  type="email"
                  placeholder="YOUR EMAIL"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  className="flex-1 px-8 sm:px-12 lg:px-16 py-8 sm:py-12 lg:py-16 bg-black text-white text-xl sm:text-3xl lg:text-5xl tracking-wider uppercase placeholder:text-[#444] transition-all focus:outline-none focus:bg-[#111] disabled:opacity-50 font-light"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-12 sm:px-16 lg:px-24 py-8 sm:py-12 lg:py-16 bg-white text-black text-lg sm:text-2xl lg:text-4xl tracking-wider uppercase transition-all hover:bg-[#ff6b35] hover:text-white font-medium disabled:opacity-50 flex items-center justify-center gap-4 sm:gap-6 group whitespace-nowrap"
                >
                  <span>{isSubmitting ? 'Signing Up...' : 'Sign Me Up'}</span>
                  <svg className="w-8 h-8 sm:w-12 sm:h-12 lg:w-16 lg:h-16 transition-transform group-hover:translate-x-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 36" fill="currentColor">
                    <path d="M26.79,9.21A35.06,35.06,0,0,0,37,16.2v3.66a35.34,35.34,0,0,0-10.21,7A12.84,12.84,0,0,0,23.21,36H17.56q0-6.22,3-10a15.4,15.4,0,0,1,8.06-5.2V20.6H0V15.43H28.63v-.3A15.16,15.16,0,0,1,20.57,10q-3-3.77-3-10h5.65a13,13,0,0,0,.87,5A12.79,12.79,0,0,0,26.79,9.21Z" />
                  </svg>
                </button>
              </div>
            </form>

            {submitMessage && (
              <p className="text-lg sm:text-xl text-[#999] mb-16 text-center">{submitMessage}</p>
            )}

            {/* Benefits grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 mb-20">
              <div className="flex items-start gap-6 py-8 border-b border-[#333] transition-all hover:border-[#ff6b35] group">
                <div className="text-[#ff6b35] text-4xl sm:text-5xl font-light mt-1 min-w-[60px] transition-all group-hover:scale-110">01</div>
                <div>
                  <h3 className="text-2xl sm:text-3xl font-medium mb-4 tracking-tight text-white">Early Access to Drops</h3>
                  <p className="text-base sm:text-lg text-[#999] leading-relaxed">Be the first to shop new releases before they sell out. Exclusive access for waitlist members.</p>
                </div>
              </div>

              <div className="flex items-start gap-6 py-8 border-b border-[#333] transition-all hover:border-[#ff6b35] group">
                <div className="text-[#ff6b35] text-4xl sm:text-5xl font-light mt-1 min-w-[60px] transition-all group-hover:scale-110">02</div>
                <div>
                  <h3 className="text-2xl sm:text-3xl font-medium mb-4 tracking-tight text-white">Launch Day Discount</h3>
                  <p className="text-base sm:text-lg text-[#999] leading-relaxed">Founding members get 20% off their first order when we officially launch.</p>
                </div>
              </div>

              <div className="flex items-start gap-6 py-8 border-b border-[#333] transition-all hover:border-[#ff6b35] group">
                <div className="text-[#ff6b35] text-4xl sm:text-5xl font-light mt-1 min-w-[60px] transition-all group-hover:scale-110">03</div>
                <div>
                  <h3 className="text-2xl sm:text-3xl font-medium mb-4 tracking-tight text-white">Shape The Brand</h3>
                  <p className="text-base sm:text-lg text-[#999] leading-relaxed">Give feedback on designs, vote on colorways, and help build the gear you actually want to run in.</p>
                </div>
              </div>

              <div className="flex items-start gap-6 py-8 border-b border-[#333] transition-all hover:border-[#ff6b35] group">
                <div className="text-[#ff6b35] text-4xl sm:text-5xl font-light mt-1 min-w-[60px] transition-all group-hover:scale-110">04</div>
                <div>
                  <h3 className="text-2xl sm:text-3xl font-medium mb-4 tracking-tight text-white">DC Running Community</h3>
                  <p className="text-base sm:text-lg text-[#999] leading-relaxed">Connect with local runners, join group runs, and be part of something bigger than yourself.</p>
                </div>
              </div>
            </div>

            {/* Strava CTA */}
            <div className="mt-20 sm:mt-32 pt-16 border-t border-[#333] text-center">
              <p className="text-sm sm:text-base text-[#999] uppercase tracking-wider mb-10">Already tracking your miles?</p>
              <button
                onClick={handleConnectStrava}
                className="px-16 py-6 sm:py-8 bg-[#ff6b35] text-white text-base sm:text-xl tracking-wider uppercase transition-all hover:bg-[#ff8555] font-medium inline-flex items-center gap-4 group"
              >
                <span>Connect Strava Now</span>
                <svg className="w-6 h-6 sm:w-8 sm:h-8 transition-transform group-hover:translate-x-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 36" fill="currentColor">
                  <path d="M26.79,9.21A35.06,35.06,0,0,0,37,16.2v3.66a35.34,35.34,0,0,0-10.21,7A12.84,12.84,0,0,0,23.21,36H17.56q0-6.22,3-10a15.4,15.4,0,0,1,8.06-5.2V20.6H0V15.43H28.63v-.3A15.16,15.16,0,0,1,20.57,10q-3-3.77-3-10h5.65a13,13,0,0,0,.87,5A12.79,12.79,0,0,0,26.79,9.21Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================== */}
      {/* BRAND STORY SECTION */}
      {/* ====================================================================== */}
      <section className="py-32 px-10 max-w-[800px] mx-auto text-center" id="story">
        <h2 className="text-[clamp(36px,6vw,56px)] font-light mb-8 tracking-tight">Built By Runners, For Runners</h2>
        <p className="text-lg leading-relaxed text-[#666] font-light mb-6">
          Started by a DC runner who logs daily Mall loops and volunteers as an Achilles guide. We're building the gear we wish existed—technical performance that earns its place in your rotation.
        </p>
        <p className="text-lg leading-relaxed text-[#666] font-light mb-8">
          From humid summer mornings to dark winter commutes, every piece is tested on the streets we all know. Designed for DC. Built for anyone who runs.
        </p>

        {/* Social proof */}
        <div className="mt-16 pt-12 border-t border-[#e5e5e5]">
          <p className="text-sm uppercase tracking-wider text-[#999] mb-6">As Seen On</p>
          <div className="flex justify-center items-center gap-12 flex-wrap">
            <div className="text-xl font-light text-[#ccc]">DC RUNNER</div>
            <div className="text-xl font-light text-[#ccc]">STRAVA</div>
            <div className="text-xl font-light text-[#ccc]">ACHILLES</div>
          </div>
        </div>
      </section>

      {/* ====================================================================== */}
      {/* FOOTER */}
      {/* ====================================================================== */}
      <footer className="bg-black text-[#666] py-20 text-center">
        <div className="text-2xl font-light text-white mb-6 tracking-wider">DISTRICT</div>
        <p className="text-xs tracking-wider uppercase mb-8">Washington DC • Running Co.</p>

        {/* Social links placeholder */}
        <div className="flex justify-center gap-6 mb-8">
          <a href="#" className="text-[#666] hover:text-white transition-colors text-xs uppercase tracking-wider">Instagram</a>
          <a href="#" className="text-[#666] hover:text-white transition-colors text-xs uppercase tracking-wider">Strava</a>
          <a href="#" className="text-[#666] hover:text-white transition-colors text-xs uppercase tracking-wider">Twitter</a>
        </div>

        <p className="text-[10px] text-[#555]">© 2026 DISTRICT. All rights reserved.</p>
      </footer>

      {/* ====================================================================== */}
      {/* FLOATING CTA BUTTON */}
      {/* ====================================================================== */}
      <div
        className={`fixed bottom-32 right-10 z-[99] transition-all duration-400 ${
          showStickyCta ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5 pointer-events-none'
        }`}
      >
        <button
          onClick={() => document.getElementById('join')?.scrollIntoView({ behavior: 'smooth' })}
          className="px-8 py-4 bg-[#ff6b35] text-white text-[13px] tracking-wider uppercase font-medium shadow-[0_10px_30px_rgba(255,107,53,0.3)] transition-all hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(255,107,53,0.4)]"
        >
          Join Waitlist
        </button>
      </div>

      {/* ====================================================================== */}
      {/* SCROLL COUNTER - "MALL LAPS" */}
      {/* ====================================================================== */}
      <div className="fixed bottom-0 left-0 right-0 bg-black py-5 text-center z-[1000] text-[11px] tracking-[2px] uppercase">
        <div className="text-[10px] text-[#666] mb-1">You've Scrolled</div>
        <div className="text-[28px] font-light text-[#ff6b35] my-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {laps.toFixed(3)}
        </div>
        <div className="text-[10px] text-[#666]">Laps Around The Mall (5 mi)</div>
      </div>

      {/* ====================================================================== */}
      {/* SUCCESS MODAL - After Waitlist Signup */}
      {/* ====================================================================== */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center px-5">
          <div className="bg-white border border-[#e5e5e5] max-w-lg w-full p-12 relative shadow-2xl animate-[fadeInUp_0.3s_ease-out]">
            <button
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-4 right-4 text-[#999] hover:text-black transition-colors p-2 hover:bg-[#fafafa]"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>

            <div className="text-center">
              <div className="w-16 h-16 bg-[#ff6b35] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#ff6b35]/20">
                <div className="text-3xl text-white">✓</div>
              </div>
              <h3 className="text-4xl font-light mb-4 tracking-tight">You're In!</h3>
              <p className="text-[#666] text-base mb-8 leading-relaxed">
                Welcome to the community. Connect your Strava to start tracking miles and unlocking drops.
              </p>

              <div className="space-y-3">
                <button
                  onClick={handleConnectStrava}
                  className="w-full px-8 py-4 text-[13px] tracking-wider uppercase font-medium bg-[#ff6b35] text-white transition-all hover:bg-[#ff8555]"
                >
                  Connect Strava
                </button>
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="w-full px-8 py-4 text-[13px] tracking-wider uppercase font-medium bg-transparent border border-[#e5e5e5] text-black transition-all hover:border-black"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* AUTHENTICATION MODAL */}
      {/* ====================================================================== */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center px-5">
          <div className="bg-white border border-[#e5e5e5] max-w-lg w-full p-12 relative shadow-2xl animate-[fadeInUp_0.3s_ease-out]">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-[#999] hover:text-black transition-colors p-2 hover:bg-[#fafafa]"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-8">
              <h3 className="text-4xl font-light mb-4 tracking-tight">
                {authMode === 'signup' ? 'Create Account' : 'Welcome Back'}
              </h3>
              <p className="text-[#666] text-sm">
                {authMode === 'signup'
                  ? 'Join the DC running community and start tracking your miles.'
                  : 'Sign in to access your dashboard and track your progress.'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'signup' && (
                <input
                  type="text"
                  placeholder="First Name"
                  required
                  value={authFirstName}
                  onChange={(e) => setAuthFirstName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-6 py-4 bg-[#fafafa] border border-[#e5e5e5] text-black text-sm focus:outline-none focus:border-black transition-all"
                />
              )}
              <input
                type="email"
                placeholder="Email Address"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-6 py-4 bg-[#fafafa] border border-[#e5e5e5] text-black text-sm focus:outline-none focus:border-black transition-all"
              />
              <input
                type="password"
                placeholder="Password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                disabled={isSubmitting}
                minLength={6}
                className="w-full px-6 py-4 bg-[#fafafa] border border-[#e5e5e5] text-black text-sm focus:outline-none focus:border-black transition-all"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-8 py-4 text-[13px] tracking-wider uppercase font-medium bg-[#ff6b35] text-white transition-all hover:bg-[#ff8555] disabled:opacity-50"
              >
                {isSubmitting ? 'Loading...' : authMode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>
              {authError && (
                <p className="text-red-600 text-sm text-center bg-red-50 border border-red-200 py-3 px-4">{authError}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'signup' ? 'signin' : 'signup');
                  setAuthError('');
                }}
                className="w-full text-sm text-[#666] hover:text-black transition-colors pt-2 font-light"
              >
                {authMode === 'signup'
                  ? 'Already have an account? Sign in'
                  : 'Need an account? Sign up'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
