import {
  Activity, ArrowRight, ArrowUpRight, BadgeCheck, BarChart3, Bell, BookOpen, Bot, Boxes, Briefcase, Building2, Calendar, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Clock, Cloud, Code2, Cog, Compass, Cpu, CreditCard, Database, Download,
  FileText, Filter, Flag, FolderGit2, Gauge, Gift, Globe, GraduationCap, Handshake, Headphones, Heart, Home, Inbox, Layers, LayoutGrid,
  Leaf, LifeBuoy, Lightbulb, LineChart, Link2, Lock, Mail, Map, MapPin, Megaphone, MessageSquare, Mic, Minus, Monitor, Package, PenTool,
  Phone, Play, Plug, Plus, Puzzle, Quote, Receipt, Recycle, Repeat, Rocket, Route, Scale, Search, Send, Server, Settings, Share2, Shield,
  ShieldCheck, ShoppingBag, Sparkles, Star, Store, Target, Timer, TrendingUp, Truck, Upload, User, Users, Wallet, Wand2, Workflow, Wrench,
  X, Zap,
} from "lucide-react";
import type { ComponentType } from "react";

/** Curated icon set, addressed by name so icons can cross into client components. */
export const ICONS = {
  activity: Activity, "arrow-right": ArrowRight, "arrow-up-right": ArrowUpRight, "badge-check": BadgeCheck, "bar-chart": BarChart3,
  bell: Bell, book: BookOpen, bot: Bot, boxes: Boxes, briefcase: Briefcase, building: Building2, calendar: Calendar, check: Check,
  "chevron-down": ChevronDown, "chevron-left": ChevronLeft, "chevron-right": ChevronRight, dollar: CircleDollarSign, clock: Clock,
  cloud: Cloud, code: Code2, cog: Cog, compass: Compass, cpu: Cpu, "credit-card": CreditCard, database: Database, download: Download,
  file: FileText, filter: Filter, flag: Flag, git: FolderGit2, gauge: Gauge, gift: Gift, globe: Globe, graduation: GraduationCap,
  handshake: Handshake, headphones: Headphones, heart: Heart, home: Home, inbox: Inbox, layers: Layers, grid: LayoutGrid, leaf: Leaf,
  lifebuoy: LifeBuoy, lightbulb: Lightbulb, "line-chart": LineChart, link: Link2, lock: Lock, mail: Mail, map: Map, pin: MapPin,
  megaphone: Megaphone, message: MessageSquare, mic: Mic, minus: Minus, monitor: Monitor, package: Package, pen: PenTool, phone: Phone,
  play: Play, plug: Plug, plus: Plus, puzzle: Puzzle, quote: Quote, receipt: Receipt, recycle: Recycle, repeat: Repeat, rocket: Rocket,
  route: Route, scale: Scale, search: Search, send: Send, server: Server, settings: Settings, share: Share2, shield: Shield,
  "shield-check": ShieldCheck, bag: ShoppingBag, sparkles: Sparkles, star: Star, store: Store, target: Target, timer: Timer,
  "trending-up": TrendingUp, truck: Truck, upload: Upload, user: User, users: Users, wallet: Wallet, wand: Wand2, workflow: Workflow,
  wrench: Wrench, x: X, zap: Zap,
} satisfies Record<string, ComponentType<{ className?: string; strokeWidth?: number }>>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-5", strokeWidth = 1.75 }: { name: IconName; className?: string; strokeWidth?: number }) {
  const C = ICONS[name];
  return <C aria-hidden className={className} strokeWidth={strokeWidth} />;
}
