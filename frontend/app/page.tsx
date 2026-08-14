import { Empty } from "@/components/ui";

export default function Home() {
  return (
    <Empty
      title="Select a submission from the queue"
      hint={
        <>
          Campaigns are ordered by risk score, highest first, with any that the
          pipeline could not assess placed above them — a submission nobody
          scored needs a human sooner than one scored low.
        </>
      }
    />
  );
}
