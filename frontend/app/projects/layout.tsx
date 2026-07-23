import AppLayout from "@/components/AppLayout";

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
