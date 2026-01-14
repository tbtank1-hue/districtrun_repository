import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, TrendingUp, Trophy, ExternalLink, RefreshCw, LogOut, Home } from 'lucide-react';

interface MileageSummary {
  current_month_miles: number;
  last_month_miles: number;
  current_year_miles: number;
  total_miles: number;
  total_activities: number;
  dc_activities: number;
  last_activity_date: string | null;
  access_tier: string;
}

interface UserData {
  first_name: string;
  last_name: string | null;
  strava_id: number | null;
  profile_picture_url: string | null;
}

interface Drop {
  id: string;
  name: string;
  description: string;
  slug: string;
  release_date: string;
  required_miles_basic: number;
  required_miles_premium: number;
  required_miles_exclusive: number;
  image_url: string | null;
}

interface DropAccess {
  drop_id: string;
  access_tier: string;
  mileage_at_qualification: number;
}

export default function Dashboard({ userId, onViewHome }: { userId: string; onViewHome?: () => void }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [mileage, setMileage] = useState<MileageSummary | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [dropAccess, setDropAccess] = useState<DropAccess[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [userId]);

  async function loadDashboardData() {
    try {
      const [userData, mileageData, dropsData, accessData] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).maybeSingle(),
        supabase.from('mileage_summary').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('drops').select('*').eq('is_published', true).order('release_date', { ascending: false }),
        supabase.from('drop_access').select('*').eq('user_id', userId),
      ]);

      if (userData.data) setUser(userData.data);
      if (mileageData.data) setMileage(mileageData.data);
      if (dropsData.data) setDrops(dropsData.data);
      if (accessData.data) setDropAccess(accessData.data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  async function syncActivities() {
    setIsSyncing(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-strava-activities`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        }
      );

      if (response.ok) {
        await loadDashboardData();
      }
    } catch (error) {
      console.error('Error syncing:', error);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  function getAccessTierColor(tier: string) {
    switch (tier) {
      case 'exclusive': return 'text-yellow-500';
      case 'premium': return 'text-purple-500';
      case 'basic': return 'text-blue-500';
      default: return 'text-neutral-500';
    }
  }

  function getAccessTierName(tier: string) {
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  }

  function getNextTier(currentMiles: number) {
    if (currentMiles < 50) return { name: 'Basic', miles: 50, remaining: 50 - currentMiles };
    if (currentMiles < 100) return { name: 'Premium', miles: 100, remaining: 100 - currentMiles };
    if (currentMiles < 150) return { name: 'Exclusive', miles: 150, remaining: 150 - currentMiles };
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl font-black text-[#ff6b35] mb-4 animate-pulse">D.</div>
          <p className="text-neutral-600 text-lg">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user?.strava_id) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <nav className="border-b border-neutral-200 px-6 py-6 bg-white/90 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="text-3xl md:text-4xl font-black text-[#ff6b35]">D.</div>
            <div className="flex items-center gap-3">
              {onViewHome && (
                <button
                  onClick={onViewHome}
                  className="flex items-center gap-2 px-6 py-2 text-xs tracking-wider uppercase bg-transparent border-2 border-neutral-200 hover:border-[#ff6b35] rounded-lg transition-all font-medium"
                >
                  <Home size={16} />
                  Home
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-6 py-2 text-xs tracking-wider uppercase bg-transparent border-2 border-neutral-200 hover:border-[#ff6b35] rounded-lg transition-all font-medium"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>
        </nav>
        <div className="flex items-center justify-center px-6 py-20 min-h-[80vh]">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 bg-[#ff6b35]/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Activity size={40} className="text-[#ff6b35]" />
            </div>
            <h2 className="text-4xl font-black mb-4 tracking-tight text-neutral-900">Connect Your Strava</h2>
            <p className="text-neutral-600 text-lg mb-8 leading-relaxed">
              Link your Strava account to start tracking miles and unlocking exclusive drops.
            </p>
            <a
              href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strava-connect?userId=${userId}`}
              className="inline-block px-10 py-4 text-sm tracking-[2px] uppercase font-bold bg-[#ff6b35] text-white rounded-lg transition-all hover:bg-[#ff8555] hover:shadow-xl hover:shadow-[#ff6b35]/30"
            >
              Connect Strava
            </a>
          </div>
        </div>
      </div>
    );
  }

  const nextTier = mileage ? getNextTier(mileage.current_month_miles) : null;
  const progressPercentage = mileage && nextTier
    ? ((mileage.current_month_miles / nextTier.miles) * 100)
    : mileage && mileage.current_month_miles >= 150
    ? 100
    : 0;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <nav className="border-b border-neutral-200 px-6 py-6 bg-white/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="text-3xl md:text-4xl font-black text-[#ff6b35]">D.</div>
          <div className="flex items-center gap-3">
            {onViewHome && (
              <button
                onClick={onViewHome}
                className="flex items-center gap-2 px-5 py-2.5 text-xs tracking-wider uppercase bg-transparent border-2 border-neutral-200 hover:border-[#ff6b35] rounded-lg transition-all font-medium"
              >
                <Home size={16} />
                <span className="hidden sm:inline">Home</span>
              </button>
            )}
            <button
              onClick={syncActivities}
              disabled={isSyncing}
              className="flex items-center gap-2 px-5 py-2.5 text-xs tracking-wider uppercase bg-neutral-100 border-2 border-neutral-200 hover:border-[#ff6b35] rounded-lg transition-all disabled:opacity-50 font-medium"
            >
              <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-5 py-2.5 text-xs tracking-wider uppercase bg-transparent border-2 border-neutral-200 hover:border-[#ff6b35] rounded-lg transition-all font-medium"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center gap-6 mb-12">
          {user.profile_picture_url && (
            <img
              src={user.profile_picture_url}
              alt={user.first_name}
              className="w-20 h-20 rounded-full border-4 border-[#ff6b35] shadow-lg shadow-[#ff6b35]/20"
            />
          )}
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2 text-neutral-900">
              Welcome back, {user.first_name}
            </h1>
            <p className="text-neutral-600 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Connected via Strava
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-12">
          <div className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#ff6b35] to-[#ff8555] rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-300" />
            <div className="relative bg-white border-2 border-neutral-200 shadow-lg rounded-xl p-6">
              <div className="flex items-center gap-2 text-neutral-600 mb-3">
                <TrendingUp size={18} />
                <span className="text-xs uppercase tracking-wider font-bold">This Month</span>
              </div>
              <div className="text-5xl font-black text-[#ff6b35] mb-1">
                {mileage?.current_month_miles.toFixed(1) || '0.0'}
              </div>
              <div className="text-sm text-neutral-500 font-medium">miles in DC</div>
            </div>
          </div>

          <div className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-neutral-400 to-neutral-500 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-300" />
            <div className="relative bg-white border-2 border-neutral-200 shadow-lg rounded-xl p-6">
              <div className="flex items-center gap-2 text-neutral-600 mb-3">
                <TrendingUp size={18} />
                <span className="text-xs uppercase tracking-wider font-bold">Last Month</span>
              </div>
              <div className="text-5xl font-black text-neutral-700 mb-1">
                {mileage?.last_month_miles.toFixed(1) || '0.0'}
              </div>
              <div className="text-sm text-neutral-500 font-medium">miles in DC</div>
            </div>
          </div>

          <div className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#ff6b35] to-[#ff8555] rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-300" />
            <div className="relative bg-white border-2 border-neutral-200 shadow-lg rounded-xl p-6">
              <div className="flex items-center gap-2 text-neutral-600 mb-3">
                <Trophy size={18} />
                <span className="text-xs uppercase tracking-wider font-bold">Access Tier</span>
              </div>
              <div className={`text-5xl font-black mb-1 ${getAccessTierColor(mileage?.access_tier || 'none')}`}>
                {getAccessTierName(mileage?.access_tier || 'none')}
              </div>
              <div className="text-sm text-neutral-500 font-medium">current level</div>
            </div>
          </div>

          <div className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#ff6b35] to-[#ff8555] rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-300" />
            <div className="relative bg-white border-2 border-neutral-200 shadow-lg rounded-xl p-6">
              <div className="flex items-center gap-2 text-neutral-600 mb-3">
                <Activity size={18} />
                <span className="text-xs uppercase tracking-wider font-bold">Total Miles</span>
              </div>
              <div className="text-5xl font-black mb-1 text-neutral-900">
                {mileage?.total_miles.toFixed(1) || '0.0'}
              </div>
              <div className="text-sm text-neutral-500 font-medium">all-time</div>
            </div>
          </div>

          <div className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#ff6b35] to-[#ff8555] rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-300" />
            <div className="relative bg-white border-2 border-neutral-200 shadow-lg rounded-xl p-6">
              <div className="flex items-center gap-2 text-neutral-600 mb-3">
                <Activity size={18} />
                <span className="text-xs uppercase tracking-wider font-bold">Activities</span>
              </div>
              <div className="text-5xl font-black mb-1 text-neutral-900">
                {mileage?.dc_activities || 0}
              </div>
              <div className="text-sm text-neutral-500 font-medium">in DC area</div>
            </div>
          </div>
        </div>

        {nextTier && (
          <div className="relative mb-12">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#ff6b35] to-[#ff8555] rounded-2xl blur opacity-20" />
            <div className="relative bg-white border-2 border-neutral-200 shadow-lg rounded-2xl p-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
                <div>
                  <h3 className="text-3xl font-black mb-2 text-neutral-900">Progress to {nextTier.name}</h3>
                  <p className="text-neutral-600 text-lg">
                    <span className="text-[#ff6b35] font-bold">{nextTier.remaining.toFixed(1)}</span> miles to unlock
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <div className="text-4xl font-black text-[#ff6b35] mb-1">
                    {mileage?.current_month_miles.toFixed(1)} / {nextTier.miles}
                  </div>
                  <div className="text-sm text-neutral-500 uppercase tracking-wider font-medium">miles this month</div>
                </div>
              </div>
              <div className="relative w-full bg-neutral-200 h-4 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#ff6b35] to-[#ff8555] transition-all duration-500 relative"
                  style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        )}

        {mileage && mileage.current_month_miles >= 150 && (
          <div className="relative mb-12">
            <div className="absolute -inset-1 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-2xl blur opacity-30" />
            <div className="relative bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-500/30 rounded-2xl p-8">
              <div className="flex items-start gap-6">
                <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Trophy className="text-yellow-600" size={32} />
                </div>
                <div>
                  <h3 className="text-3xl font-black mb-2 text-yellow-700">Exclusive Access Unlocked!</h3>
                  <p className="text-neutral-700 text-lg leading-relaxed">
                    You've reached the highest tier. You have access to all drops and exclusive limited editions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div>
          <h2 className="text-4xl font-black mb-8 tracking-tight text-neutral-900">Available Drops</h2>
          {drops.length === 0 ? (
            <div className="bg-white border-2 border-neutral-200 shadow-lg rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="text-neutral-400" size={32} />
              </div>
              <p className="text-neutral-600 text-lg">No drops available at the moment. Check back soon!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {drops.map((drop) => {
                const hasAccess = dropAccess.some((access) => access.drop_id === drop.id);
                const userAccess = dropAccess.find((access) => access.drop_id === drop.id);

                return (
                  <div
                    key={drop.id}
                    className="group relative"
                  >
                    <div className={`absolute -inset-0.5 bg-gradient-to-r from-[#ff6b35] to-[#ff8555] rounded-2xl blur ${
                      hasAccess ? 'opacity-40' : 'opacity-20 group-hover:opacity-30'
                    } transition duration-300`} />
                    <div className="relative bg-white border-2 border-neutral-200 shadow-lg rounded-2xl overflow-hidden">
                      {drop.image_url && (
                        <div className="aspect-video bg-neutral-200 relative overflow-hidden">
                          <img
                            src={drop.image_url}
                            alt={drop.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          {hasAccess && (
                            <div className="absolute top-4 right-4 bg-[#ff6b35] text-white px-4 py-2 text-xs font-black uppercase tracking-wider rounded-lg shadow-lg">
                              Unlocked
                            </div>
                          )}
                        </div>
                      )}
                      <div className="p-6">
                        <h3 className="text-2xl font-black mb-2 text-neutral-900">{drop.name}</h3>
                        <p className="text-neutral-600 mb-4 leading-relaxed">{drop.description}</p>

                        {hasAccess ? (
                          <div>
                            <div className="text-sm text-neutral-600 mb-4">
                              Your tier: <span className={`font-bold ${getAccessTierColor(userAccess!.access_tier)}`}>
                                {getAccessTierName(userAccess!.access_tier)}
                              </span>
                            </div>
                            <a
                              href={`/drops/${drop.slug}`}
                              className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-[#ff6b35] text-white font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-[#ff8555] hover:shadow-xl hover:shadow-[#ff6b35]/30 transition-all"
                            >
                              View Drop
                              <ExternalLink size={16} />
                            </a>
                          </div>
                        ) : (
                          <div>
                            <div className="text-xs text-neutral-500 mb-4 leading-relaxed">
                              <span className="font-bold text-neutral-700">{drop.required_miles_basic}+</span> (Basic) · <span className="font-bold text-neutral-700">{drop.required_miles_premium}+</span> (Premium) · <span className="font-bold text-neutral-700">{drop.required_miles_exclusive}+</span> (Exclusive)
                            </div>
                            <div className="w-full px-6 py-3 bg-neutral-100 text-neutral-600 font-bold text-sm uppercase tracking-wider text-center rounded-lg border-2 border-neutral-200">
                              {mileage && mileage.current_month_miles < drop.required_miles_basic
                                ? `${(drop.required_miles_basic - mileage.current_month_miles).toFixed(1)} miles to unlock`
                                : 'Not qualified'}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
