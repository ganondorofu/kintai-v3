import {
  LucideProps,
  Home,
  User,
  PanelLeft,
  Settings,
  Bell,
  CheckCircle2,
  XCircle,
  QrCode,
  ArrowRight,
  UserPlus,
  Clock,
  Calendar,
  BarChart,
  Users,
  LogOut,
  LogIn,
  Network,
  History,
  FilePenLine,
} from 'lucide-react';

export const Icons = {
  Home,
  User,
  PanelLeft,
  Settings,
  Bell,
  CheckCircle2,
  XCircle,
  QrCode,
  ArrowRight,
  UserPlus,
  Clock,
  Calendar,
  BarChart,
  Users,
  LogOut,
  LogIn,
  Network,
  History,
  FilePenLine,
  Logo: (props: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
  Discord: (props: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2a10 10 0 0 0-10 10c0 4.4 2.9 8.1 6.8 9.5.5.1.7-.2.7-.4v-1.6c-2.8.6-3.4-1.2-3.4-1.2-.4-1-1-1.3-1-1.3-.8-.5.1-.5.1-.5.9.1 1.4.9 1.4.9.8 1.4 2.1 1 2.7.7.1-.6.3-1 .5-1.2-2.1-.2-4.2-1-4.2-4.7 0-1 .4-1.9.9-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.2 2.5 1 .7-.2 1.5-.3 2.3-.3.8 0 1.6.1 2.3.3 1.7-1.2 2.5-1 2.5-1 .5 1.3.2 2.3.1 2.5.5.7.9 1.5.9 2.6 0 3.7-2.2 4.5-4.2 4.7.3.3.6.8.6 1.5v2.2c0 .2.2.5.7.4A10 10 0 0 0 22 12a10 10 0 0 0-10-10z"></path>
    </svg>
  ),
};