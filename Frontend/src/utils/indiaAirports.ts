import type { Aircraft } from "../types";

export type IndiaAirport = {
  id: string;
  name: string;
  city: string;
  state: string;
  iata: string | null;
  icao: string;
  latitude: number;
  longitude: number;
  aliases?: string[];
};

export const INDIA_AIRPORTS: IndiaAirport[] = [
  { id: "in-0015", name: "Baljek Airport", city: "Baljek", state: "Meghalaya", iata: null, icao: "IN-0015", latitude: 25.661487579345703, longitude: 90.34503936767578, aliases: ["Baljek airport"] },
  { id: "jsa", name: "Jaisalmer Airport", city: "Jaisalmer", state: "Rajasthan", iata: "JSA", icao: "VIJR", latitude: 26.8887, longitude: 70.864998, aliases: ["Jaisalmer airport", "jsa"] },
  { id: "jrg", name: "Jharsuguda Airport", city: "Jharsuguda", state: "Odisha", iata: "JRG", icao: "VEJH", latitude: 21.9135, longitude: 84.0504, aliases: ["Jharsuguda airport", "jrg"] },
  { id: "tez", name: "Tezpur Airport", city: "Tezpur", state: "Assam", iata: "TEZ", icao: "VETZ", latitude: 26.7091007232666, longitude: 92.78469848632812, aliases: ["tez", "Tezpur airport"] },
  { id: "aip", name: "Adampur Airport", city: "Adampur", state: "Punjab", iata: "AIP", icao: "VIAX", latitude: 31.4338, longitude: 75.758797, aliases: ["Adampur airport", "aip"] },
  { id: "ixa", name: "Agartala - Maharaja Bir Bikram Airport", city: "Agartala", state: "Tripura", iata: "IXA", icao: "VEAT", latitude: 23.886999, longitude: 91.240402, aliases: ["Agartala airport", "ixa"] },
  { id: "agx", name: "Agatti Airport", city: "Agatti", state: "Lakshadweep", iata: "AGX", icao: "VOAT", latitude: 10.8237, longitude: 72.176003, aliases: ["Agatti airport", "agx"] },
  { id: "agr", name: "Agra Airport / Agra Air Force Station", city: "Agra", state: "Uttar Pradesh", iata: "AGR", icao: "VIAG", latitude: 27.157975, longitude: 77.961025, aliases: ["agr", "Agra airport"] },
  { id: "amd", name: "Sardar Vallabh Patel International Airport", city: "Ahmedabad", state: "Gujarat", iata: "AMD", icao: "VAAH", latitude: 23.0772, longitude: 72.634697, aliases: ["Ahmedabad airport", "amd"] },
  { id: "ajl", name: "Lengpui Airport", city: "Aizawl (Lengpui)", state: "Mizoram", iata: "AJL", icao: "VELP", latitude: 23.840599, longitude: 92.619698, aliases: ["Aizawl (Lengpui) airport", "ajl"] },
  { id: "kqh", name: "Kishangarh Airport Ajmer", city: "Ajmer (Kishangarh)", state: "Rajasthan", iata: "KQH", icao: "VIKG", latitude: 26.591007, longitude: 74.812956, aliases: ["Ajmer (Kishangarh) airport", "kqh"] },
  { id: "hrh", name: "Aligarh Airport", city: "Aligarh", state: "Uttar Pradesh", iata: "HRH", icao: "VIAH", latitude: 27.861437, longitude: 78.145404, aliases: ["Aligarh airport", "hrh"] },
  { id: "ixd", name: "Prayagraj Airport", city: "Allahabad", state: "Uttar Pradesh", iata: "IXD", icao: "VEAB", latitude: 25.4401, longitude: 81.733902, aliases: ["Allahabad airport", "ixd"] },
  { id: "aha", name: "Maa Mahamaya Airport", city: "Ambikapur", state: "Chhattisgarh", iata: "AHA", icao: "VEAP", latitude: 22.98753, longitude: 83.19612, aliases: ["aha", "Ambikapur airport"] },
  { id: "atq", name: "Sri Guru Ram Das Ji International Airport", city: "Amritsar", state: "Punjab", iata: "ATQ", icao: "VIAR", latitude: 31.7096, longitude: 74.797302, aliases: ["Amritsar airport", "atq"] },
  { id: "ixu", name: "Aurangabad Airport", city: "Aurangabad", state: "Maharashtra", iata: "IXU", icao: "VAAU", latitude: 19.862875, longitude: 75.396312, aliases: ["Aurangabad airport", "ixu"] },
  { id: "bek", name: "Bareilly Air Force Station", city: "Bareilly", state: "Uttar Pradesh", iata: "BEK", icao: "VIBY", latitude: 28.4221, longitude: 79.450798, aliases: ["Bareilly airport", "bek"] },
  { id: "ixg", name: "Belagavi Airport", city: "Belgaum", state: "Karnataka", iata: "IXG", icao: "VOBM", latitude: 15.8593, longitude: 74.618301, aliases: ["Belgaum airport", "ixg"] },
  { id: "blr", name: "Kempegowda International Airport Bengaluru", city: "Bengaluru", state: "Karnataka", iata: "BLR", icao: "VOBL", latitude: 13.1979, longitude: 77.706299, aliases: ["Bengaluru airport", "blr"] },
  { id: "bhu", name: "Bhavnagar Airport", city: "Bhavnagar", state: "Gujarat", iata: "BHU", icao: "VABV", latitude: 21.752199173, longitude: 72.1852035522, aliases: ["Bhavnagar airport", "bhu"] },
  { id: "uke", name: "Utkela Airport", city: "Bhawanipatna", state: "Odisha", iata: "UKE", icao: "IN-0376", latitude: 20.097778, longitude: 83.183333, aliases: ["Bhawanipatna airport", "uke"] },
  { id: "bho", name: "Raja Bhoj International Airport", city: "Bhopal", state: "Madhya Pradesh", iata: "BHO", icao: "VABP", latitude: 23.2875, longitude: 77.337402, aliases: ["bho", "Bhopal airport"] },
  { id: "bbi", name: "Biju Patnaik International Airport", city: "Bhubaneswar", state: "Odisha", iata: "BBI", icao: "VEBS", latitude: 20.251021, longitude: 85.814747, aliases: ["bbi", "Bhubaneswar airport"] },
  { id: "bhj", name: "Bhuj Airport", city: "Bhuj", state: "Gujarat", iata: "BHJ", icao: "VABJ", latitude: 23.2877998352, longitude: 69.6701965332, aliases: ["bhj", "Bhuj airport"] },
  { id: "kuu", name: "Kullu Manali Airport", city: "Bhuntar", state: "Himachal Pradesh", iata: "KUU", icao: "VIBR", latitude: 31.876699, longitude: 77.154404, aliases: ["Bhuntar airport", "kuu"] },
  { id: "pab", name: "Bilaspur Airport", city: "Bilaspur", state: "Chhattisgarh", iata: "PAB", icao: "VEBU", latitude: 21.9884, longitude: 82.111, aliases: ["Bilaspur airport", "pab"] },
  { id: "ccj", name: "Calicut International Airport", city: "Calicut", state: "Kerala", iata: "CCJ", icao: "VOCL", latitude: 11.135996, longitude: 75.955152, aliases: ["Calicut airport", "ccj"] },
  { id: "ixc", name: "Shaheed Bhagat Singh International Airport", city: "Chandigarh", state: "Chandigarh", iata: "IXC", icao: "VICG", latitude: 30.6735, longitude: 76.788498, aliases: ["Chandigarh airport", "ixc"] },
  { id: "maa", name: "Chennai International Airport", city: "Chennai", state: "Tamil Nadu", iata: "MAA", icao: "VOMM", latitude: 12.990005, longitude: 80.169296, aliases: ["Chennai airport", "maa"] },
  { id: "sdw", name: "Sindhudurg Airport", city: "Chipi", state: "Maharashtra", iata: "SDW", icao: "VOSR", latitude: 16.002552, longitude: 73.529846, aliases: ["Chipi airport", "sdw"] },
  { id: "cjb", name: "Coimbatore International Airport", city: "Coimbatore", state: "Tamil Nadu", iata: "CJB", icao: "VOCB", latitude: 11.03, longitude: 77.043404, aliases: ["cjb", "Coimbatore airport"] },
  { id: "dbr", name: "Darbhanga Airport", city: "Darbhanga", state: "Bihar", iata: "DBR", icao: "VEDH", latitude: 26.192801, longitude: 85.916901, aliases: ["Darbhanga airport", "dbr"] },
  { id: "ded", name: "Dehradun Jolly Grant Airport", city: "Dehradun (Jauligrant)", state: "Uttarakhand", iata: "DED", icao: "VIDN", latitude: 30.189243, longitude: 78.176651, aliases: ["ded", "Dehradun (Jauligrant) airport"] },
  { id: "dgh", name: "Deoghar Airport", city: "Deoghar", state: "Jharkhand", iata: "DGH", icao: "VEDO", latitude: 24.446842, longitude: 86.704955, aliases: ["Deoghar airport", "dgh"] },
  { id: "dib", name: "Dibrugarh Airport", city: "Dibrugarh", state: "Assam", iata: "DIB", icao: "VEMN", latitude: 27.4839000702, longitude: 95.0168991089, aliases: ["dib", "Dibrugarh airport"] },
  { id: "dmu", name: "Dimapur Airport", city: "Dimapur", state: "Nagaland", iata: "DMU", icao: "VEMR", latitude: 25.883899688699998, longitude: 93.77110290530001, aliases: ["Dimapur airport", "dmu"] },
  { id: "diu", name: "Diu Airport", city: "Diu", state: "Dadra and Nagar Haveli and Daman and Diu", iata: "DIU", icao: "VADU", latitude: 20.714185, longitude: 70.921855, aliases: ["diu", "Diu airport"] },
  { id: "rdp", name: "Kazi Nazrul Islam Airport", city: "Durgapur", state: "West Bengal", iata: "RDP", icao: "VEDG", latitude: 23.6225, longitude: 87.243, aliases: ["Durgapur airport", "rdp"] },
  { id: "ayj", name: "Maharshi Valmiki International Airport", city: "Faizabad", state: "Uttar Pradesh", iata: "AYJ", icao: "VEAY", latitude: 26.747736, longitude: 82.163664, aliases: ["ayj", "Faizabad airport"] },
  { id: "gay", name: "Gaya Airport", city: "Gaya", state: "Bihar", iata: "GAY", icao: "VEGY", latitude: 24.744301, longitude: 84.951202, aliases: ["gay", "Gaya airport"] },
  { id: "hdo", name: "Hindon Airport / Hindon Air Force Station", city: "Ghaziabad", state: "Uttar Pradesh", iata: "HDO", icao: "VIDX", latitude: 28.707701, longitude: 77.358902, aliases: ["Ghaziabad airport", "hdo"] },
  { id: "gdb", name: "Gondia Airport", city: "Gondia", state: "Maharashtra", iata: "GDB", icao: "VAGD", latitude: 21.526817, longitude: 80.290347, aliases: ["gdb", "Gondia airport"] },
  { id: "gop", name: "Gorakhpur Airport", city: "Gorakhpur", state: "Uttar Pradesh", iata: "GOP", icao: "VEGK", latitude: 26.739700317399997, longitude: 83.4496994019, aliases: ["gop", "Gorakhpur airport"] },
  { id: "gau", name: "Lokpriya Gopinath Bordoloi International Airport", city: "Guwahati", state: "Assam", iata: "GAU", icao: "VEGT", latitude: 26.106654, longitude: 91.585226, aliases: ["gau", "Guwahati airport"] },
  { id: "gwl", name: "Gwalior Airport", city: "Gwalior", state: "Madhya Pradesh", iata: "GWL", icao: "VIGR", latitude: 26.29330062866211, longitude: 78.22779846191406, aliases: ["Gwalior airport", "gwl"] },
  { id: "hwr", name: "Halwara International Airport", city: "Halwara", state: "Punjab", iata: "HWR", icao: "VIHX", latitude: 30.748501, longitude: 75.629799, aliases: ["Halwara airport", "hwr"] },
  { id: "hss", name: "Maharaja Agrasen International Airport", city: "Hisar", state: "Haryana", iata: "HSS", icao: "VIHR", latitude: 29.186065, longitude: 75.74142, aliases: ["Hisar airport", "hss"] },
  { id: "hgi", name: "Itanagar Donyi Polo Hollongi Airport", city: "Hollongi", state: "Arunachal Pradesh", iata: "HGI", icao: "VEHO", latitude: 26.96683, longitude: 93.638792, aliases: ["hgi", "Hollongi airport"] },
  { id: "hbx", name: "Hubballi Airport", city: "Hubballi", state: "Karnataka", iata: "HBX", icao: "VOHB", latitude: 15.361084, longitude: 75.082096, aliases: ["hbx", "Hubballi airport"] },
  { id: "hyd", name: "Rajiv Gandhi International Airport", city: "Hyderabad", state: "Telangana", iata: "HYD", icao: "VOHS", latitude: 17.231318, longitude: 78.429855, aliases: ["hyd", "Hyderabad airport"] },
  { id: "imf", name: "Bir Tikendrajit International Airport", city: "Imphal", state: "Manipur", iata: "IMF", icao: "VEIM", latitude: 24.76, longitude: 93.896698, aliases: ["imf", "Imphal airport"] },
  { id: "idr", name: "Devi Ahilya Bai Holkar International Airport", city: "Indore", state: "Madhya Pradesh", iata: "IDR", icao: "VAID", latitude: 22.721404, longitude: 75.80051, aliases: ["idr", "Indore airport"] },
  { id: "jlr", name: "Jabalpur Airport", city: "Jabalpur", state: "Madhya Pradesh", iata: "JLR", icao: "VAJB", latitude: 23.177799, longitude: 80.052002, aliases: ["Jabalpur airport", "jlr"] },
  { id: "jgb", name: "Jagdalpur Airport", city: "Jagdalpur", state: "Chhattisgarh", iata: "JGB", icao: "VEJR", latitude: 19.074301, longitude: 82.036797, aliases: ["Jagdalpur airport", "jgb"] },
  { id: "jai", name: "Jaipur International Airport", city: "Jaipur", state: "Rajasthan", iata: "JAI", icao: "VIJP", latitude: 26.8242, longitude: 75.812202, aliases: ["jai", "Jaipur airport"] },
  { id: "jlg", name: "Jalgaon Airport", city: "Jalgaon", state: "Maharashtra", iata: "JLG", icao: "VAJL", latitude: 20.962678, longitude: 75.627492, aliases: ["Jalgaon airport", "jlg"] },
  { id: "ixj", name: "Jammu Airport", city: "Jammu", state: "Jammu and Kashmir", iata: "IXJ", icao: "VIJU", latitude: 32.688849, longitude: 74.838152, aliases: ["ixj", "Jammu airport"] },
  { id: "jga", name: "Jamnagar Airport", city: "Jamnagar", state: "Gujarat", iata: "JGA", icao: "VAJM", latitude: 22.465499877929688, longitude: 70.01260375976562, aliases: ["Jamnagar airport", "jga"] },
  { id: "jdh", name: "Jodhpur Airport", city: "Jodhpur", state: "Rajasthan", iata: "JDH", icao: "VIJO", latitude: 26.251100540161133, longitude: 73.04889678955078, aliases: ["jdh", "Jodhpur airport"] },
  { id: "jrh", name: "Jorhat Airport", city: "Jorhat", state: "Assam", iata: "JRH", icao: "VEJT", latitude: 26.730456, longitude: 94.175416, aliases: ["Jorhat airport", "jrh"] },
  { id: "cdp", name: "Kadapa Airport", city: "Kadapa", state: "Andhra Pradesh", iata: "CDP", icao: "VOCP", latitude: 14.513154, longitude: 78.769183, aliases: ["cdp", "Kadapa airport"] },
  { id: "sag", name: "Shirdi International Airport", city: "Kakadi", state: "Maharashtra", iata: "SAG", icao: "VASD", latitude: 19.689211, longitude: 74.373655, aliases: ["Kakadi airport", "sag"] },
  { id: "gbi", name: "Kalaburagi Airport", city: "Kalaburagi", state: "Karnataka", iata: "GBI", icao: "VOGB", latitude: 17.308154, longitude: 76.965246, aliases: ["gbi", "Kalaburagi airport"] },
  { id: "ixy", name: "Kandla Airport", city: "Kandla", state: "Gujarat", iata: "IXY", icao: "VAKE", latitude: 23.1127, longitude: 70.100304, aliases: ["ixy", "Kandla airport"] },
  { id: "dhm", name: "Kangra Airport", city: "Kangra", state: "Himachal Pradesh", iata: "DHM", icao: "VIGG", latitude: 32.164902, longitude: 76.263018, aliases: ["dhm", "Kangra airport"] },
  { id: "cnn", name: "Kannur International Airport", city: "Kannur", state: "Kerala", iata: "CNN", icao: "VOKN", latitude: 11.916343, longitude: 75.544979, aliases: ["cnn", "Kannur airport"] },
  { id: "knu", name: "Kanpur Airport", city: "Kanpur", state: "Uttar Pradesh", iata: "KNU", icao: "VEKA", latitude: 26.404301, longitude: 80.410103, aliases: ["Kanpur airport", "knu"] },
  { id: "ixk", name: "Keshod Airport", city: "Keshod", state: "Gujarat", iata: "IXK", icao: "VAKS", latitude: 21.317101, longitude: 70.270401, aliases: ["ixk", "Keshod airport"] },
  { id: "hjr", name: "Khajuraho Airport", city: "Khajuraho", state: "Madhya Pradesh", iata: "HJR", icao: "VEKO", latitude: 24.8172, longitude: 79.918602, aliases: ["hjr", "Khajuraho airport"] },
  { id: "cok", name: "Cochin International Airport", city: "Kochi", state: "Kerala", iata: "COK", icao: "VOCI", latitude: 10.151047, longitude: 76.400838, aliases: ["cok", "Kochi airport"] },
  { id: "klh", name: "Kolhapur Airport", city: "Kolhapur", state: "Maharashtra", iata: "KLH", icao: "VAKP", latitude: 16.6647, longitude: 74.289398, aliases: ["klh", "Kolhapur airport"] },
  { id: "ccu", name: "Netaji Subhash Chandra Bose International Airport", city: "Kolkata", state: "West Bengal", iata: "CCU", icao: "VECC", latitude: 22.654012, longitude: 88.44765, aliases: ["ccu", "Kolkata airport"] },
  { id: "ltu", name: "Murod Kond Airport", city: "Latur", state: "Maharashtra", iata: "LTU", icao: "VALT", latitude: 18.411501, longitude: 76.464699, aliases: ["Latur airport", "ltu"] },
  { id: "ixl", name: "Leh Kushok Bakula Rimpochee Airport", city: "Leh", state: "Ladakh", iata: "IXL", icao: "VILH", latitude: 34.135899, longitude: 77.546501, aliases: ["ixl", "Leh airport"] },
  { id: "ixi", name: "Lilabari North Lakhimpur Airport", city: "Lilabari", state: "Assam", iata: "IXI", icao: "VELR", latitude: 27.295682, longitude: 94.097266, aliases: ["ixi", "Lilabari airport"] },
  { id: "lko", name: "Chaudhary Charan Singh International Airport", city: "Lucknow", state: "Uttar Pradesh", iata: "LKO", icao: "VILK", latitude: 26.760599, longitude: 80.889297, aliases: ["lko", "Lucknow airport"] },
  { id: "rja", name: "Rajahmundry Airport", city: "Madhurapudi", state: "Andhra Pradesh", iata: "RJA", icao: "VORY", latitude: 17.105799, longitude: 81.813204, aliases: ["Madhurapudi airport", "rja"] },
  { id: "ixm", name: "Madurai Airport", city: "Madurai", state: "Tamil Nadu", iata: "IXM", icao: "VOMD", latitude: 9.83450984955, longitude: 78.09339904790001, aliases: ["ixm", "Madurai airport"] },
  { id: "ixe", name: "Mangaluru International Airport", city: "Mangaluru", state: "Karnataka", iata: "IXE", icao: "VOML", latitude: 12.95471, longitude: 74.886812, aliases: ["ixe", "Mangaluru airport"] },
  { id: "gox", name: "Manohar International Airport", city: "Mopa", state: "Goa", iata: "GOX", icao: "VOGA", latitude: 15.744257, longitude: 73.860625, aliases: ["gox", "Mopa airport"] },
  { id: "mzs", name: "Moradabad Airport", city: "Moradabad", state: "Uttar Pradesh", iata: "MZS", icao: "VIMB", latitude: 28.81746, longitude: 78.92187, aliases: ["Moradabad airport", "mzs"] },
  { id: "bom", name: "Chhatrapati Shivaji Maharaj International Airport", city: "Mumbai", state: "Maharashtra", iata: "BOM", icao: "VABB", latitude: 19.088699, longitude: 72.867897, aliases: ["bom", "Mumbai airport"] },
  { id: "myq", name: "Mysore Airport", city: "Mysore", state: "Karnataka", iata: "MYQ", icao: "VOMY", latitude: 12.229751, longitude: 76.653683, aliases: ["myq", "Mysore airport"] },
  { id: "nag", name: "Dr. Babasaheb Ambedkar International Airport", city: "Nagpur", state: "Maharashtra", iata: "NAG", icao: "VANP", latitude: 21.092199, longitude: 79.047203, aliases: ["nag", "Nagpur airport"] },
  { id: "ndc", name: "Nanded Airport", city: "Nanded", state: "Maharashtra", iata: "NDC", icao: "VOND", latitude: 19.1833, longitude: 77.316704, aliases: ["Nanded airport", "ndc"] },
  { id: "isk", name: "Nashik International Airport", city: "Nashik", state: "Maharashtra", iata: "ISK", icao: "VAOZ", latitude: 20.119101, longitude: 73.912903, aliases: ["isk", "Nashik airport"] },
  { id: "nmi", name: "Navi Mumbai International Airport", city: "Navi Mumbai", state: "Maharashtra", iata: "NMI", icao: "VANM", latitude: 18.984597, longitude: 73.065253, aliases: ["Navi Mumbai airport", "nmi"] },
  { id: "del", name: "Indira Gandhi International Airport", city: "New Delhi", state: "Delhi", iata: "DEL", icao: "VIDP", latitude: 28.55563, longitude: 77.09519, aliases: ["del", "New Delhi airport"] },
  { id: "kjb", name: "Kurnool Airport", city: "Orvakal", state: "Andhra Pradesh", iata: "KJB", icao: "VOKU", latitude: 15.716288, longitude: 78.16923, aliases: ["kjb", "Orvakal airport"] },
  { id: "pgh", name: "Pantnagar Airport", city: "Pantnagar", state: "Uttar Pradesh", iata: "PGH", icao: "VIPT", latitude: 29.0334, longitude: 79.473701, aliases: ["Pantnagar airport", "pgh"] },
  { id: "ixp", name: "Pathankot Airport", city: "Pathankot", state: "Punjab", iata: "IXP", icao: "VIPK", latitude: 32.233611, longitude: 75.634444, aliases: ["ixp", "Pathankot airport"] },
  { id: "pat", name: "Jay Prakash Narayan Airport", city: "Patna", state: "Bihar", iata: "PAT", icao: "VEPT", latitude: 25.591299, longitude: 85.087997, aliases: ["pat", "Patna airport"] },
  { id: "pbd", name: "Porbandar Airport", city: "Porbandar", state: "Gujarat", iata: "PBD", icao: "VAPR", latitude: 21.649524, longitude: 69.656405, aliases: ["pbd", "Porbandar airport"] },
  { id: "ixz", name: "Veer Savarkar International Airport / INS Utkrosh", city: "Port Blair", state: "Andaman and Nicobar Islands", iata: "IXZ", icao: "VOPB", latitude: 11.640194, longitude: 92.72902, aliases: ["ixz", "Port Blair airport"] },
  { id: "pny", name: "Pondicherry Airport", city: "Puducherry (Pondicherry)", state: "Puducherry", iata: "PNY", icao: "VOPC", latitude: 11.968, longitude: 79.812, aliases: ["pny", "Puducherry (Pondicherry) airport"] },
  { id: "in-0024", name: "Baramati Airport", city: "Pune", state: "Maharashtra", iata: null, icao: "IN-0024", latitude: 18.226944, longitude: 74.590833, aliases: ["Pune airport"] },
  { id: "pnq", name: "Pune International Airport", city: "Pune", state: "Maharashtra", iata: "PNQ", icao: "VAPO", latitude: 18.5821, longitude: 73.919701, aliases: ["pnq", "Pune airport"] },
  { id: "rpr", name: "Swami Vivekananda Airport", city: "Raipur", state: "Chhattisgarh", iata: "RPR", icao: "VERP", latitude: 21.180401, longitude: 81.7388, aliases: ["Raipur airport", "rpr"] },
  { id: "hsr", name: "Rajkot International Airport", city: "Rajkot", state: "Gujarat", iata: "HSR", icao: "VAHS", latitude: 22.378824, longitude: 71.039391, aliases: ["hsr", "Rajkot airport"] },
  { id: "ixr", name: "Birsa Munda Airport", city: "Ranchi", state: "Jharkhand", iata: "IXR", icao: "VERC", latitude: 23.314300537100003, longitude: 85.3217010498, aliases: ["ixr", "Ranchi airport"] },
  { id: "rew", name: "Rewa Airport, Chorhata, REWA", city: "Rewa", state: "Madhya Pradesh", iata: "REW", icao: "VA1G", latitude: 24.503401, longitude: 81.220299, aliases: ["rew", "Rewa airport"] },
  { id: "shl", name: "Shillong Airport", city: "Shillong", state: "Meghalaya", iata: "SHL", icao: "VEBI", latitude: 25.70359992980957, longitude: 91.97869873046875, aliases: ["Shillong airport", "shl"] },
  { id: "vsv", name: "Shravasti Airport", city: "Shravasti", state: "Uttar Pradesh", iata: "VSV", icao: "VISV", latitude: 27.499732, longitude: 82.032927, aliases: ["Shravasti airport", "vsv"] },
  { id: "ixs", name: "Silchar Airport", city: "Silchar", state: "Assam", iata: "IXS", icao: "VEKU", latitude: 24.9129009247, longitude: 92.97869873050001, aliases: ["ixs", "Silchar airport"] },
  { id: "ixb", name: "Bagdogra Airport", city: "Siliguri", state: "West Bengal", iata: "IXB", icao: "VEBD", latitude: 26.6812, longitude: 88.328598, aliases: ["ixb", "Siliguri airport"] },
  { id: "sxr", name: "Sheikh ul Alam International Airport", city: "Srinagar", state: "Jammu and Kashmir", iata: "SXR", icao: "VISR", latitude: 33.987099, longitude: 74.7742, aliases: ["Srinagar airport", "sxr"] },
  { id: "vesl", name: "Sultanpur Airport", city: "Sultanpur", state: "Uttar Pradesh", iata: null, icao: "VESL", latitude: 26.2475, longitude: 82.0425, aliases: ["Sultanpur airport"] },
  { id: "stv", name: "Surat International Airport", city: "Surat", state: "Gujarat", iata: "STV", icao: "VASU", latitude: 21.115531, longitude: 72.743251, aliases: ["stv", "Surat airport"] },
  { id: "trv", name: "Thiruvananthapuram International Airport", city: "Thiruvananthapuram", state: "Kerala", iata: "TRV", icao: "VOTV", latitude: 8.481889, longitude: 76.920029, aliases: ["Thiruvananthapuram airport", "trv"] },
  { id: "trz", name: "Tiruchirappalli International Airport", city: "Tiruchirappalli", state: "Tamil Nadu", iata: "TRZ", icao: "VOTR", latitude: 10.762915, longitude: 78.717741, aliases: ["Tiruchirappalli airport", "trz"] },
  { id: "tir", name: "Tirupati International Airport", city: "Tirupati", state: "Andhra Pradesh", iata: "TIR", icao: "VOTP", latitude: 13.631988, longitude: 79.539869, aliases: ["tir", "Tirupati airport"] },
  { id: "udr", name: "Maharana Pratap Airport", city: "Udaipur", state: "Rajasthan", iata: "UDR", icao: "VAUD", latitude: 24.617700576799997, longitude: 73.89610290530001, aliases: ["Udaipur airport", "udr"] },
  { id: "bdq", name: "Vadodara International Airport", city: "Vadodara", state: "Gujarat", iata: "BDQ", icao: "VABO", latitude: 22.336201, longitude: 73.226303, aliases: ["bdq", "Vadodara airport"] },
  { id: "tcr", name: "Tuticorin Airport", city: "Vagaikulam", state: "Tamil Nadu", iata: "TCR", icao: "VOTK", latitude: 8.724241, longitude: 78.025803, aliases: ["tcr", "Vagaikulam airport"] },
  { id: "vns", name: "Lal Bahadur Shastri International Airport", city: "Varanasi", state: "Uttar Pradesh", iata: "VNS", icao: "VEBN", latitude: 25.452171, longitude: 82.862549, aliases: ["Varanasi airport", "vns"] },
  { id: "goi", name: "Goa Dabolim International Airport", city: "Vasco da Gama", state: "Goa", iata: "GOI", icao: "VOGO", latitude: 15.380062, longitude: 73.833328, aliases: ["goi", "Vasco da Gama airport"] },
  { id: "vga", name: "Vijayawada International Airport", city: "Vijayawada", state: "Andhra Pradesh", iata: "VGA", icao: "VOBZ", latitude: 16.530011, longitude: 80.804888, aliases: ["vga", "Vijayawada airport"] },
  { id: "vtz", name: "Visakhapatnam International Airport", city: "Visakhapatnam", state: "Andhra Pradesh", iata: "VTZ", icao: "VOVZ", latitude: 17.723506, longitude: 83.227729, aliases: ["Visakhapatnam airport", "vtz"] },
];

const ROUTE_COVERAGE_RADIUS_KM = 750;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function bearingDegrees(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const y = Math.sin(toRadians(toLon - fromLon)) * Math.cos(toRadians(toLat));
  const x =
    Math.cos(toRadians(fromLat)) * Math.sin(toRadians(toLat)) -
    Math.sin(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.cos(toRadians(toLon - fromLon));
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function angleDifference(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function airportDisplayCode(airport: Pick<IndiaAirport, "iata" | "icao">): string {
  return airport.iata ?? airport.icao;
}

function airportSearchText(airport: IndiaAirport): string {
  return [
    airport.name,
    airport.city,
    airport.state,
    airport.iata ?? "",
    airport.icao,
    ...(airport.aliases ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function searchIndiaAirports(query: string, limit = 6): IndiaAirport[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];

  return INDIA_AIRPORTS
    .filter((airport) => airportSearchText(airport).includes(normalized))
    .sort((a, b) => {
      const aStarts = airportSearchText(a).startsWith(normalized) ? 0 : 1;
      const bStarts = airportSearchText(b).startsWith(normalized) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.city.localeCompare(b.city);
    })
    .slice(0, limit);
}

export function countFlightsNearLocation(
  aircraft: Aircraft[],
  latitude: number,
  longitude: number,
  radiusKm: number
): number {
  return aircraft.filter((item) => distanceKm(latitude, longitude, item.latitude, item.longitude) <= radiusKm).length;
}

export function findNearestAirport(latitude: number, longitude: number): IndiaAirport | null {
  if (!INDIA_AIRPORTS.length) return null;
  return INDIA_AIRPORTS.reduce((best, airport) => {
    const currentDistance = distanceKm(latitude, longitude, airport.latitude, airport.longitude);
    const bestDistance = distanceKm(latitude, longitude, best.latitude, best.longitude);
    return currentDistance < bestDistance ? airport : best;
  });
}

export function findLikelyRoute(aircraft: Aircraft): { origin: IndiaAirport | null; destination: IndiaAirport | null } {
  const nearestAirport = findNearestAirport(aircraft.latitude, aircraft.longitude);
  if (
    !nearestAirport ||
    distanceKm(aircraft.latitude, aircraft.longitude, nearestAirport.latitude, nearestAirport.longitude) > ROUTE_COVERAGE_RADIUS_KM
  ) {
    return { origin: null, destination: null };
  }

  let origin: IndiaAirport | null = null;
  let destination: IndiaAirport | null = null;
  let originScore = Number.POSITIVE_INFINITY;
  let destinationScore = Number.POSITIVE_INFINITY;

  for (const airport of INDIA_AIRPORTS) {
    const distance = distanceKm(aircraft.latitude, aircraft.longitude, airport.latitude, airport.longitude);
    const outboundBearing = bearingDegrees(airport.latitude, airport.longitude, aircraft.latitude, aircraft.longitude);
    const inboundBearing = bearingDegrees(aircraft.latitude, aircraft.longitude, airport.latitude, airport.longitude);
    const originAlignment = angleDifference(outboundBearing, aircraft.heading);
    const destinationAlignment = angleDifference(inboundBearing, aircraft.heading);
    const originCandidateScore = distance + originAlignment * 2.4;
    const destinationCandidateScore = distance + destinationAlignment * 2.4;

    if (originCandidateScore < originScore) {
      origin = airport;
      originScore = originCandidateScore;
    }

    if (destinationCandidateScore < destinationScore) {
      destination = airport;
      destinationScore = destinationCandidateScore;
    }
  }

  if (origin && destination && origin.id === destination.id) {
    const alternatives = INDIA_AIRPORTS.filter((airport) => airport.id !== origin?.id).sort((a, b) => {
      const aScore = distanceKm(aircraft.latitude, aircraft.longitude, a.latitude, a.longitude) + angleDifference(bearingDegrees(aircraft.latitude, aircraft.longitude, a.latitude, a.longitude), aircraft.heading) * 2.4;
      const bScore = distanceKm(aircraft.latitude, aircraft.longitude, b.latitude, b.longitude) + angleDifference(bearingDegrees(aircraft.latitude, aircraft.longitude, b.latitude, b.longitude), aircraft.heading) * 2.4;
      return aScore - bScore;
    });
    destination = alternatives[0] ?? destination;
  }

  return { origin, destination };
}
