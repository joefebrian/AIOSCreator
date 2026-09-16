export function SoonCanvas({ tool }: { tool: string }) {
  return (
    <div className="grid min-h-[320px] place-items-center p-8 text-center">
      <div>
        <p className="text-[14px] font-semibold capitalize">{tool.replace(/-/g, " ")}</p>
        <p className="mt-1 text-[13px] text-[#6B7280]">Soon — listed so the IA is complete. Canvas is not faked.</p>
      </div>
    </div>
  );
}
