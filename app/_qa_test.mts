
import { consolidateRecent } from "@/lib/chat/qaStore";
const r = await consolidateRecent("65251760-229d-4ba0-8d70-869cfde06592");
console.log("result:", JSON.stringify(r));
