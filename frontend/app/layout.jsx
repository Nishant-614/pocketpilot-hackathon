export const metadata = {
  title: "PocketPilot | AI Personal Finance Companion",
  description: "Understand your money, organise shared costs, and make informed PayPal Sandbox payment decisions.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: "#f8fafc", color: "#0f172a" }}>
        {children}
      </body>
    </html>
  );
}
