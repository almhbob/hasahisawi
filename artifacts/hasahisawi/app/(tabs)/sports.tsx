import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  Linking, Alert, TextInput, Modal, Pressable, Image, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { fsGetCollection, fsAddDoc, fsDeleteDoc, COLLECTIONS, orderBy, isFirebaseAvailable } from "@/lib/firebase/firestore";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import AnimatedPress from "@/components/AnimatedPress";
import Colors from "@/constants/colors";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
export const SPORT_CLUBS_KEY  = "sport_clubs_v1";
export const SPORT_EVENTS_KEY = "sport_events_v1";
const POSTS_KEY   = "koura_posts_v2";
const PLAYERS_KEY = "koura_players_v2";
const MATCHES_KEY = "koura_matches_v2";
const ADMIN_KEY   = "koura_admin_v1";
const KOURA_PIN   = "4444";

// ─── Types (exported for other screens) ──────────────────────────────────────
export type SportClub = {
  id: string; name: string;
  sport: "football"|"basketball"|"volleyball"|"athletics"|"swimming"|"boxing"|"other";
  address: string; phone: string; description?: string; founded?: string;
  colors?: string; achievements?: string;
};
export type SportEvent = {
  id: string; title: string; sport: SportClub["sport"];
  date: string; location: string; description?: string; contactPhone?: string;
};
type PostCategory = "نقل"|"منافسة"|"خبر"|"نتيجة"|"تحليل";
type PostComment  = { id:string; author:string; text:string; createdAt:string };
type KouraPost    = {
  id:string; title:string; body:string; category:PostCategory;
  imageUrl?:string; author:string; likes:number; likedByMe:boolean;
  comments:PostComment[]; createdAt:string;
};
type PlayerPosition =
  "حارس مرمى"|"مدافع أيمن"|"مدافع أيسر"|"قلب دفاع"|"وسط دفاعي"|
  "وسط"|"وسط مهاجم"|"جناح أيمن"|"جناح أيسر"|"مهاجم"|"مهاجم ثانٍ";
type KouraPlayer  = {
  id:string; name:string; position:PlayerPosition; club:string;
  number:string; age:string; bio?:string; imageUrl?:string;
  stats:{ goals:number; assists:number; matches:number; yellowCards:number; redCards:number };
  featured:boolean; featuredUntil?:string; featuredDays?:number; createdAt:string;
};
type MatchStatus = "upcoming"|"live"|"finished";
type KouraMatch   = {
  id:string; homeTeam:string; awayTeam:string; competition:string;
  date:string; time:string; venue:string; homeScore?:number; awayScore?:number;
  status:MatchStatus; description?:string; createdAt:string;
};

// ─── Exported helpers ─────────────────────────────────────────────────────────
export async function loadSportClubs(): Promise<SportClub[]> {
  try {
    if (isFirebaseAvailable()) {
      return await fsGetCollection<SportClub>(COLLECTIONS.SPORTS_CLUBS, orderBy("name"));
    }
    return [];
  } catch { return []; }
}
export async function loadSportEvents(): Promise<SportEvent[]> {
  try {
    if (isFirebaseAvailable()) {
      return await fsGetCollection<SportEvent>("sport_events", orderBy("date", "desc"));
    }
    return [];
  } catch { return []; }
}
export function getSportLabel(sport: SportClub["sport"]) {
  const m: Record<SportClub["sport"],string> = { football:"كرة قدم", basketball:"كرة سلة", volleyball:"كرة طائرة", athletics:"ألعاب قوى", swimming:"سباحة", boxing:"ملاكمة", other:"رياضة أخرى" };
  return m[sport];
}
export function getSportColor(sport: SportClub["sport"]) {
  const m: Record<SportClub["sport"],string> = { football:"#27AE60", basketball:"#E67E22", volleyball:"#2980B9", athletics:"#8E44AD", swimming:"#16A085", boxing:"#C0392B", other:Colors.textSecondary };
  return m[sport];
}
export function getSportIcon(sport: SportClub["sport"]) {
  const m: Record<SportClub["sport"],string> = { football:"football-outline", basketball:"basketball-outline", volleyball:"tennisball-outline", athletics:"walk-outline", swimming:"water-outline", boxing:"fitness-outline", other:"trophy-outline" };
  return m[sport];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
const POSITIONS: PlayerPosition[] = ["حارس مرمى","مدافع أيمن","مدافع أيسر","قلب دفاع","وسط دفاعي","وسط","وسط مهاجم","جناح أيمن","جناح أيسر","مهاجم","مهاجم ثانٍ"];
const POS_COLOR: Record<PlayerPosition,string> = {
  "حارس مرمى":"#E67E22","مدافع أيمن":Colors.primary,"مدافع أيسر":Colors.primary,"قلب دفاع":Colors.primary,
  "وسط دفاعي":"#2980B9","وسط":"#2980B9","وسط مهاجم":"#8E44AD",
  "جناح أيمن":"#8E44AD","جناح أيسر":"#8E44AD","مهاجم":"#E74C3C","مهاجم ثانٍ":"#E74C3C",
};
const CAT_META: Record<PostCategory,{color:string;icon:string}> = {
  "نقل":    { color:"#8E44AD", icon:"swap-horizontal-outline" },
  "منافسة": { color:"#E74C3C", icon:"trophy-outline" },
  "خبر":    { color:Colors.primary, icon:"newspaper-outline" },
  "نتيجة":  { color:"#E67E22", icon:"stats-chart-outline" },
  "تحليل":  { color:Colors.cyber, icon:"analytics-outline" },
};
const isFeaturedActive = (p:KouraPlayer) =>
  p.featured && p.featuredUntil ? new Date(p.featuredUntil) > new Date() : p.featured;

function timeAgo(iso:string) {
  const m = Math.floor((Date.now()-new Date(iso).getTime())/60000);
  if (m<1) return "الآن";
  if (m<60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m/60);
  if (h<24) return `منذ ${h} ساعة`;
  return `منذ ${Math.floor(h/24)} يوم`;
}

// ─── Post Card ────────────────────────────────────────────────────────────────
function PostCard({ post, onLike, onPress, admin, onDelete }:{
  post:KouraPost; onLike:()=>void; onPress:()=>void; admin?:boolean; onDelete?:()=>void;
}) {
  const cat = CAT_META[post.category];
  return (
    <TouchableOpacity style={pc.card} onPress={onPress} activeOpacity={0.9}>
      {post.imageUrl ? <Image source={{uri:post.imageUrl}} style={pc.img} resizeMode="cover" /> : null}
      <View style={pc.body}>
        <View style={pc.topRow}>
          <View style={{flexDirection:"row-reverse",gap:8,alignItems:"center"}}>
            {admin && onDelete && (
              <TouchableOpacity hitSlop={10} onPress={onDelete}>
                <Ionicons name="trash-outline" size={14} color={Colors.danger+"90"} />
              </TouchableOpacity>
            )}
            <Text style={pc.time}>{timeAgo(post.createdAt)}</Text>
          </View>
          <View style={[pc.catBadge,{backgroundColor:cat.color+"20"}]}>
            <Ionicons name={cat.icon as any} size={11} color={cat.color} />
            <Text style={[pc.catText,{color:cat.color}]}>{post.category}</Text>
          </View>
        </View>
        <Text style={pc.title}>{post.title}</Text>
        <Text style={pc.bodyTxt} numberOfLines={3}>{post.body}</Text>
        <View style={pc.footer}>
          <View style={{flexDirection:"row-reverse",alignItems:"center",gap:4}}>
            <Ionicons name="chatbubble-outline" size={14} color={Colors.textMuted} />
            <Text style={pc.footNum}>{post.comments.length}</Text>
          </View>
          <TouchableOpacity style={pc.likeBtn} onPress={e=>{e.stopPropagation?.();onLike();}}>
            <Ionicons name={post.likedByMe?"heart":"heart-outline"} size={18} color={post.likedByMe?Colors.danger:Colors.textMuted} />
            <Text style={[pc.footNum,post.likedByMe&&{color:Colors.danger}]}>{post.likes}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}
const pc = StyleSheet.create({
  card:     {backgroundColor:Colors.cardBg,borderRadius:18,overflow:"hidden",borderWidth:1,borderColor:Colors.divider,marginBottom:12},
  img:      {width:"100%",height:180},
  body:     {padding:14},
  topRow:   {flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",marginBottom:8},
  catBadge: {flexDirection:"row-reverse",alignItems:"center",gap:4,borderRadius:8,paddingHorizontal:8,paddingVertical:3},
  catText:  {fontFamily:"Cairo_600SemiBold",fontSize:11},
  time:     {fontFamily:"Cairo_400Regular",fontSize:11,color:Colors.textMuted},
  title:    {fontFamily:"Cairo_700Bold",fontSize:16,color:Colors.textPrimary,textAlign:"right",marginBottom:6,lineHeight:24},
  bodyTxt:  {fontFamily:"Cairo_400Regular",fontSize:13,color:Colors.textSecondary,textAlign:"right",lineHeight:20,marginBottom:10},
  footer:   {flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between"},
  likeBtn:  {flexDirection:"row-reverse",alignItems:"center",gap:4,paddingHorizontal:8,paddingVertical:4,borderRadius:8,backgroundColor:Colors.bg},
  footNum:  {fontFamily:"Cairo_500Medium",fontSize:12,color:Colors.textMuted},
});

// ─── Post Detail Modal (comments) ────────────────────────────────────────────
function PostDetailModal({ post, visible, onClose, onAddComment, onLike }:{
  post:KouraPost|null; visible:boolean; onClose:()=>void;
  onAddComment:(text:string,author:string)=>void; onLike:()=>void;
}) {
  const insets = useSafeAreaInsets();
  const [txt, setTxt]     = useState("");
  const [name, setName]   = useState("");
  if (!post) return null;
  const cat = CAT_META[post.category];
  const submit = () => {
    if (!txt.trim()) return;
    onAddComment(txt.trim(), name.trim()||"زائر");
    setTxt(""); setName("");
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":"height"}>
        <Pressable style={dm.overlay} onPress={onClose}>
          <Pressable style={[dm.sheet,{paddingBottom:insets.bottom+8}]} onPress={e=>e.stopPropagation()}>
            <View style={dm.handle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:16}}>
              {post.imageUrl ? <Image source={{uri:post.imageUrl}} style={dm.img} resizeMode="cover" /> : null}
              <View style={dm.pad}>
                <View style={[dm.catRow,{backgroundColor:cat.color+"18"}]}>
                  <Text style={[dm.catTxt,{color:cat.color}]}>{post.category}</Text>
                  <Text style={dm.timeTxt}>{timeAgo(post.createdAt)} · {post.author}</Text>
                </View>
                <Text style={dm.title}>{post.title}</Text>
                <Text style={dm.body}>{post.body}</Text>
                <View style={dm.likeRow}>
                  <TouchableOpacity style={{flexDirection:"row-reverse",alignItems:"center",gap:6}} onPress={onLike}>
                    <Ionicons name={post.likedByMe?"heart":"heart-outline"} size={20} color={post.likedByMe?Colors.danger:Colors.textMuted} />
                    <Text style={[dm.timeTxt,post.likedByMe&&{color:Colors.danger}]}>{post.likes} إعجاب</Text>
                  </TouchableOpacity>
                  <Text style={dm.timeTxt}>{post.comments.length} تعليق</Text>
                </View>
              </View>
              <View style={dm.divider} />
              <View style={dm.pad}>
                <Text style={dm.commTitle}>التعليقات</Text>
                {post.comments.length===0 && <Text style={dm.noCmts}>كن أول من يعلّق!</Text>}
                {post.comments.map(c=>(
                  <View key={c.id} style={dm.cmtRow}>
                    <View style={dm.avatar}><Text style={dm.avatarTxt}>{c.author[0]}</Text></View>
                    <View style={{flex:1}}>
                      <View style={{flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                        <Text style={dm.timeTxt}>{timeAgo(c.createdAt)}</Text>
                        <Text style={dm.cmtAuthor}>{c.author}</Text>
                      </View>
                      <Text style={dm.cmtText}>{c.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
            <View style={dm.inputArea}>
              <TextInput style={dm.nameInput} value={name} onChangeText={setName} placeholder="اسمك (اختياري)" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <View style={{flexDirection:"row-reverse",alignItems:"flex-end",gap:8}}>
                <TouchableOpacity style={dm.sendBtn} onPress={submit}>
                  <Ionicons name="send" size={18} color="#fff" />
                </TouchableOpacity>
                <TextInput style={dm.cmtInput} value={txt} onChangeText={setTxt} placeholder="اكتب تعليقاً..." placeholderTextColor={Colors.textMuted} textAlign="right" multiline />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const dm = StyleSheet.create({
  overlay:   {flex:1,backgroundColor:"rgba(0,0,0,0.62)",justifyContent:"flex-end"},
  sheet:     {backgroundColor:Colors.cardBg,borderTopLeftRadius:28,borderTopRightRadius:28,maxHeight:"92%"},
  handle:    {width:40,height:4,borderRadius:2,backgroundColor:Colors.divider,alignSelf:"center",marginVertical:12},
  img:       {width:"100%",height:200},
  pad:       {padding:16},
  catRow:    {flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",borderRadius:10,paddingHorizontal:12,paddingVertical:6,marginBottom:12},
  catTxt:    {fontFamily:"Cairo_600SemiBold",fontSize:12},
  timeTxt:   {fontFamily:"Cairo_400Regular",fontSize:11,color:Colors.textMuted},
  title:     {fontFamily:"Cairo_700Bold",fontSize:18,color:Colors.textPrimary,textAlign:"right",lineHeight:26,marginBottom:10},
  body:      {fontFamily:"Cairo_400Regular",fontSize:14,color:Colors.textSecondary,textAlign:"right",lineHeight:22},
  likeRow:   {flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:Colors.divider},
  divider:   {height:1,backgroundColor:Colors.divider},
  commTitle: {fontFamily:"Cairo_700Bold",fontSize:15,color:Colors.textPrimary,textAlign:"right",marginBottom:12},
  noCmts:    {fontFamily:"Cairo_400Regular",fontSize:13,color:Colors.textMuted,textAlign:"center",paddingVertical:16},
  cmtRow:    {flexDirection:"row-reverse",gap:10,marginBottom:12,alignItems:"flex-start"},
  avatar:    {width:34,height:34,borderRadius:17,backgroundColor:Colors.primary+"20",justifyContent:"center",alignItems:"center"},
  avatarTxt: {fontFamily:"Cairo_700Bold",fontSize:14,color:Colors.primary},
  cmtAuthor: {fontFamily:"Cairo_600SemiBold",fontSize:12,color:Colors.textPrimary},
  cmtText:   {fontFamily:"Cairo_400Regular",fontSize:13,color:Colors.textSecondary,textAlign:"right",lineHeight:18},
  inputArea: {borderTopWidth:1,borderTopColor:Colors.divider,padding:12},
  nameInput: {backgroundColor:Colors.bg,borderRadius:10,paddingHorizontal:12,paddingVertical:7,fontFamily:"Cairo_400Regular",fontSize:12,color:Colors.textPrimary,borderWidth:1,borderColor:Colors.divider,marginBottom:8},
  cmtInput:  {flex:1,backgroundColor:Colors.bg,borderRadius:14,paddingHorizontal:14,paddingVertical:10,fontFamily:"Cairo_400Regular",fontSize:13,color:Colors.textPrimary,borderWidth:1,borderColor:Colors.divider,maxHeight:80},
  sendBtn:   {width:42,height:42,borderRadius:12,backgroundColor:Colors.primary,justifyContent:"center",alignItems:"center"},
});

// ─── Player Card ──────────────────────────────────────────────────────────────
function PlayerCard({ player, onPress }:{ player:KouraPlayer; onPress:()=>void }) {
  const c = POS_COLOR[player.position]||Colors.primary;
  const active = isFeaturedActive(player);
  return (
    <TouchableOpacity style={[pl.card,active&&pl.featuredCard]} onPress={onPress} activeOpacity={0.88}>
      {active && (
        <View style={pl.starBadge}>
          <Ionicons name="star" size={9} color="#fff" />
          <Text style={pl.starTxt}>مميز</Text>
        </View>
      )}
      <View style={pl.imgWrap}>
        {player.imageUrl
          ? <Image source={{uri:player.imageUrl}} style={pl.img} resizeMode="cover" />
          : <View style={[pl.imgPlaceholder,{backgroundColor:c+"20"}]}><Ionicons name="person" size={38} color={c} /></View>
        }
        {player.number ? <View style={[pl.numBadge,{backgroundColor:c}]}><Text style={pl.numTxt}>{player.number}</Text></View> : null}
      </View>
      <View style={pl.info}>
        <Text style={pl.name} numberOfLines={1}>{player.name}</Text>
        <View style={[pl.posBadge,{backgroundColor:c+"20"}]}>
          <Text style={[pl.posText,{color:c}]}>{player.position}</Text>
        </View>
        <Text style={pl.club} numberOfLines={1}>{player.club}</Text>
        <View style={pl.statsRow}>
          {[{n:player.stats.goals,l:"هدف"},{n:player.stats.assists,l:"تمريرة"},{n:player.stats.matches,l:"مباراة"}].map((st,i,arr)=>(
            <React.Fragment key={st.l}>
              <View style={pl.stat}><Text style={pl.statN}>{st.n}</Text><Text style={pl.statL}>{st.l}</Text></View>
              {i<arr.length-1 && <View style={pl.div} />}
            </React.Fragment>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}
const CARD_W = 158;
const pl = StyleSheet.create({
  card:          {width:CARD_W,backgroundColor:Colors.cardBg,borderRadius:18,overflow:"hidden",borderWidth:1,borderColor:Colors.divider,marginLeft:12},
  featuredCard:  {borderColor:"#F0A500",borderWidth:1.5},
  starBadge:     {position:"absolute",top:8,left:8,flexDirection:"row-reverse",alignItems:"center",gap:3,backgroundColor:"#F0A500",borderRadius:8,paddingHorizontal:6,paddingVertical:2,zIndex:10},
  starTxt:       {fontFamily:"Cairo_700Bold",fontSize:9,color:"#fff"},
  imgWrap:       {width:"100%",aspectRatio:1,position:"relative"},
  img:           {width:"100%",height:"100%"},
  imgPlaceholder:{width:"100%",height:"100%",justifyContent:"center",alignItems:"center"},
  numBadge:      {position:"absolute",bottom:6,right:6,width:28,height:28,borderRadius:14,justifyContent:"center",alignItems:"center"},
  numTxt:        {fontFamily:"Cairo_700Bold",fontSize:13,color:"#fff"},
  info:          {padding:10,alignItems:"flex-end"},
  name:          {fontFamily:"Cairo_700Bold",fontSize:14,color:Colors.textPrimary,textAlign:"right"},
  posBadge:      {borderRadius:6,paddingHorizontal:8,paddingVertical:2,marginTop:4},
  posText:       {fontFamily:"Cairo_600SemiBold",fontSize:10},
  club:          {fontFamily:"Cairo_400Regular",fontSize:11,color:Colors.textMuted,textAlign:"right",marginTop:2},
  statsRow:      {flexDirection:"row-reverse",alignItems:"center",marginTop:8,width:"100%"},
  stat:          {flex:1,alignItems:"center"},
  statN:         {fontFamily:"Cairo_700Bold",fontSize:14,color:Colors.textPrimary},
  statL:         {fontFamily:"Cairo_400Regular",fontSize:9,color:Colors.textMuted,marginTop:1},
  div:           {width:1,height:24,backgroundColor:Colors.divider},
});

// ─── Player Detail Modal ──────────────────────────────────────────────────────
function PlayerDetailModal({ player, visible, onClose, admin, onFeature, onEdit, onDelete }:{
  player:KouraPlayer|null; visible:boolean; onClose:()=>void;
  admin?:boolean; onFeature?:()=>void; onEdit?:()=>void; onDelete?:()=>void;
}) {
  const insets = useSafeAreaInsets();
  if (!player) return null;
  const c = POS_COLOR[player.position]||Colors.primary;
  const active = isFeaturedActive(player);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pdl.overlay} onPress={onClose}>
        <Pressable style={[pdl.sheet,{paddingBottom:insets.bottom+12}]} onPress={e=>e.stopPropagation()}>
          <View style={pdl.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={pdl.hero}>
              {player.imageUrl
                ? <Image source={{uri:player.imageUrl}} style={pdl.heroImg} resizeMode="cover" />
                : <LinearGradient colors={[c+"40",c+"15"]} style={pdl.heroPh}><Ionicons name="person" size={80} color={c} /></LinearGradient>
              }
              {active && (
                <View style={pdl.featuredBar}>
                  <Ionicons name="star" size={12} color="#fff" />
                  <Text style={pdl.featuredBarTxt}>لاعب مميز — إعلان نشط</Text>
                </View>
              )}
              <View style={[pdl.numCircle,{backgroundColor:c}]}>
                <Text style={pdl.numTxt}>{player.number||"—"}</Text>
              </View>
            </View>
            <View style={pdl.body}>
              <Text style={pdl.name}>{player.name}</Text>
              <View style={[pdl.posBadge,{backgroundColor:c+"20"}]}>
                <Text style={[pdl.posTxt,{color:c}]}>{player.position}</Text>
              </View>
              <Text style={pdl.club}>{player.club}</Text>
              {player.age ? <Text style={pdl.detail}>العمر: {player.age} سنة</Text> : null}
              {player.bio ? <Text style={pdl.bio}>{player.bio}</Text> : null}
              <View style={pdl.statsGrid}>
                {[{l:"أهداف",v:player.stats.goals},{l:"تمريرات حاسمة",v:player.stats.assists},{l:"مباريات",v:player.stats.matches},{l:"إنذارات",v:player.stats.yellowCards},{l:"طرد",v:player.stats.redCards}].map(st=>(
                  <View key={st.l} style={pdl.statItem}>
                    <Text style={pdl.statNum}>{st.v}</Text>
                    <Text style={pdl.statLbl}>{st.l}</Text>
                  </View>
                ))}
              </View>
              {admin && (
                <View style={pdl.adminRow}>
                  <TouchableOpacity style={[pdl.aBtn,{backgroundColor:Colors.danger+"15"}]} onPress={onDelete}>
                    <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                    <Text style={[pdl.aBtnTxt,{color:Colors.danger}]}>حذف</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[pdl.aBtn,{backgroundColor:Colors.primary+"15"}]} onPress={onEdit}>
                    <Ionicons name="create-outline" size={15} color={Colors.primary} />
                    <Text style={[pdl.aBtnTxt,{color:Colors.primary}]}>تعديل</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[pdl.aBtn,{backgroundColor:"#F0A50015"}]} onPress={onFeature}>
                    <Ionicons name="star-outline" size={15} color="#F0A500" />
                    <Text style={[pdl.aBtnTxt,{color:"#F0A500"}]}>{active?"إلغاء تمييز":"تمييز / إعلان"}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const pdl = StyleSheet.create({
  overlay:    {flex:1,backgroundColor:"rgba(0,0,0,0.65)",justifyContent:"flex-end"},
  sheet:      {backgroundColor:Colors.cardBg,borderTopLeftRadius:28,borderTopRightRadius:28,maxHeight:"90%"},
  handle:     {width:40,height:4,borderRadius:2,backgroundColor:Colors.divider,alignSelf:"center",marginVertical:12},
  hero:       {width:"100%",aspectRatio:2.2,position:"relative"},
  heroImg:    {width:"100%",height:"100%"},
  heroPh:     {width:"100%",height:"100%",justifyContent:"center",alignItems:"center"},
  featuredBar:{position:"absolute",top:0,left:0,right:0,flexDirection:"row",justifyContent:"center",alignItems:"center",gap:6,backgroundColor:"#F0A500CC",paddingVertical:7},
  featuredBarTxt:{fontFamily:"Cairo_700Bold",fontSize:13,color:"#fff"},
  numCircle:  {position:"absolute",bottom:-16,right:20,width:40,height:40,borderRadius:20,justifyContent:"center",alignItems:"center",borderWidth:3,borderColor:Colors.cardBg},
  numTxt:     {fontFamily:"Cairo_700Bold",fontSize:16,color:"#fff"},
  body:       {padding:20,paddingTop:26,alignItems:"flex-end"},
  name:       {fontFamily:"Cairo_700Bold",fontSize:22,color:Colors.textPrimary,textAlign:"right"},
  posBadge:   {borderRadius:8,paddingHorizontal:12,paddingVertical:4,marginTop:6},
  posTxt:     {fontFamily:"Cairo_700Bold",fontSize:13},
  club:       {fontFamily:"Cairo_500Medium",fontSize:14,color:Colors.textSecondary,marginTop:4},
  detail:     {fontFamily:"Cairo_400Regular",fontSize:13,color:Colors.textMuted,marginTop:4},
  bio:        {fontFamily:"Cairo_400Regular",fontSize:14,color:Colors.textSecondary,textAlign:"right",lineHeight:22,marginTop:12,width:"100%"},
  statsGrid:  {flexDirection:"row-reverse",flexWrap:"wrap",gap:10,marginTop:20,justifyContent:"flex-end",width:"100%"},
  statItem:   {alignItems:"center",backgroundColor:Colors.bg,borderRadius:14,padding:12,minWidth:62,borderWidth:1,borderColor:Colors.divider},
  statNum:    {fontFamily:"Cairo_700Bold",fontSize:22,color:Colors.textPrimary},
  statLbl:    {fontFamily:"Cairo_400Regular",fontSize:10,color:Colors.textMuted,marginTop:2,textAlign:"center"},
  adminRow:   {flexDirection:"row-reverse",gap:8,marginTop:20,width:"100%"},
  aBtn:       {flex:1,flexDirection:"row-reverse",alignItems:"center",justifyContent:"center",gap:5,paddingVertical:10,borderRadius:12},
  aBtnTxt:    {fontFamily:"Cairo_600SemiBold",fontSize:12},
});

// ─── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({ match }:{ match:KouraMatch }) {
  const live = match.status==="live";
  const fin  = match.status==="finished";
  const sc   = live?"#E74C3C":fin?Colors.textMuted:Colors.primary;
  const sl   = live?"🔴 مباشر":fin?"انتهت":"قادمة";
  return (
    <View style={mc.card}>
      <View style={mc.header}>
        <Text style={mc.comp}>{match.competition}</Text>
        <View style={[mc.sBadge,{backgroundColor:sc+"20"}]}>
          <Text style={[mc.sTxt,{color:sc}]}>{sl}</Text>
        </View>
      </View>
      <View style={mc.teams}>
        <View style={mc.team}>
          <Text style={mc.tName}>{match.awayTeam}</Text>
          {fin||live ? <Text style={mc.score}>{match.awayScore??0}</Text>
            : <Ionicons name="football-outline" size={20} color={Colors.textMuted} />}
        </View>
        <View style={mc.vs}>
          {!(fin||live) && <Text style={mc.vsTime}>{match.time}</Text>}
          <Text style={[mc.vsText,fin&&{color:Colors.textMuted}]}>{fin?"النتيجة":"VS"}</Text>
          <Text style={mc.vsDate}>{match.date}</Text>
        </View>
        <View style={mc.team}>
          {fin||live ? <Text style={mc.score}>{match.homeScore??0}</Text>
            : <Ionicons name="football-outline" size={20} color={Colors.textMuted} />}
          <Text style={mc.tName}>{match.homeTeam}</Text>
        </View>
      </View>
      <View style={mc.foot}>
        <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
        <Text style={mc.venue}>{match.venue}</Text>
      </View>
      {match.description ? <Text style={mc.desc}>{match.description}</Text> : null}
    </View>
  );
}
const mc = StyleSheet.create({
  card:   {backgroundColor:Colors.cardBg,borderRadius:18,borderWidth:1,borderColor:Colors.divider,overflow:"hidden",marginBottom:12},
  header: {flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",padding:12,paddingBottom:8,borderBottomWidth:1,borderBottomColor:Colors.divider},
  comp:   {fontFamily:"Cairo_700Bold",fontSize:13,color:Colors.textPrimary},
  sBadge: {borderRadius:8,paddingHorizontal:8,paddingVertical:3},
  sTxt:   {fontFamily:"Cairo_600SemiBold",fontSize:11},
  teams:  {flexDirection:"row-reverse",alignItems:"center",paddingHorizontal:12,paddingVertical:18,gap:8},
  team:   {flex:1,alignItems:"center",gap:6},
  tName:  {fontFamily:"Cairo_700Bold",fontSize:14,color:Colors.textPrimary,textAlign:"center"},
  score:  {fontFamily:"Cairo_700Bold",fontSize:38,color:Colors.textPrimary},
  vs:     {alignItems:"center",gap:2},
  vsTime: {fontFamily:"Cairo_700Bold",fontSize:14,color:Colors.primary},
  vsText: {fontFamily:"Cairo_700Bold",fontSize:16,color:Colors.primary},
  vsDate: {fontFamily:"Cairo_400Regular",fontSize:11,color:Colors.textMuted},
  foot:   {flexDirection:"row-reverse",alignItems:"center",gap:4,paddingHorizontal:12,paddingBottom:10},
  venue:  {fontFamily:"Cairo_400Regular",fontSize:11,color:Colors.textMuted},
  desc:   {fontFamily:"Cairo_400Regular",fontSize:12,color:Colors.textSecondary,textAlign:"right",padding:12,paddingTop:0,lineHeight:18},
});

// ─── Club Card ────────────────────────────────────────────────────────────────
function ClubCard({ club }:{ club:SportClub }) {
  const [expanded, setExpanded] = useState(false);
  const c = getSportColor(club.sport);
  return (
    <View style={cc.card}>
      <TouchableOpacity style={cc.top} onPress={()=>setExpanded(e=>!e)} activeOpacity={0.85}>
        <Ionicons name={expanded?"chevron-up":"chevron-down"} size={18} color={Colors.textMuted} />
        <View style={{flex:1}}>
          <Text style={cc.name}>{club.name}</Text>
          <View style={cc.tagRow}>
            <View style={[cc.tag,{backgroundColor:c+"18"}]}>
              <Ionicons name={getSportIcon(club.sport) as any} size={11} color={c} />
              <Text style={[cc.tagTxt,{color:c}]}>{getSportLabel(club.sport)}</Text>
            </View>
            {club.founded && <Text style={cc.founded}>تأسس {club.founded}</Text>}
          </View>
        </View>
        <View style={[cc.iconBox,{backgroundColor:c+"18"}]}>
          <Ionicons name={getSportIcon(club.sport) as any} size={26} color={c} />
        </View>
      </TouchableOpacity>
      {expanded && (
        <Animated.View entering={FadeInDown.duration(200)} style={cc.details}>
          <View style={cc.divider} />
          {club.description && <Text style={cc.desc}>{club.description}</Text>}
          <View style={cc.dRow}><Text style={cc.dVal}>{club.address}</Text><Ionicons name="location-outline" size={13} color={Colors.textMuted} /></View>
          {club.colors && <View style={cc.dRow}><Text style={cc.dVal}>{club.colors}</Text><Ionicons name="color-palette-outline" size={13} color={Colors.textMuted} /></View>}
          {club.achievements && <View style={cc.dRow}><Text style={cc.dVal}>{club.achievements}</Text><Ionicons name="trophy-outline" size={13} color={Colors.textMuted} /></View>}
          {club.phone ? (
            <TouchableOpacity style={[cc.callBtn,{backgroundColor:c}]} onPress={()=>Linking.openURL(`tel:${club.phone}`)}>
              <Ionicons name="call" size={15} color="#fff" />
              <Text style={cc.callTxt}>اتصل بالنادي</Text>
            </TouchableOpacity>
          ):null}
        </Animated.View>
      )}
    </View>
  );
}
const cc = StyleSheet.create({
  card:    {backgroundColor:Colors.cardBg,borderRadius:18,overflow:"hidden",borderWidth:1,borderColor:Colors.divider,marginBottom:12},
  top:     {flexDirection:"row-reverse",alignItems:"center",padding:14,gap:12},
  iconBox: {width:50,height:50,borderRadius:14,justifyContent:"center",alignItems:"center"},
  name:    {fontFamily:"Cairo_700Bold",fontSize:15,color:Colors.textPrimary,textAlign:"right"},
  tagRow:  {flexDirection:"row-reverse",alignItems:"center",gap:8,marginTop:4},
  tag:     {flexDirection:"row-reverse",alignItems:"center",gap:4,borderRadius:6,paddingHorizontal:8,paddingVertical:2},
  tagTxt:  {fontFamily:"Cairo_500Medium",fontSize:11},
  founded: {fontFamily:"Cairo_400Regular",fontSize:11,color:Colors.textMuted},
  details: {paddingHorizontal:14,paddingBottom:14},
  divider: {height:1,backgroundColor:Colors.divider,marginBottom:12},
  desc:    {fontFamily:"Cairo_400Regular",fontSize:13,color:Colors.textSecondary,textAlign:"right",lineHeight:20,marginBottom:10},
  dRow:    {flexDirection:"row-reverse",alignItems:"center",gap:6,marginBottom:6},
  dVal:    {fontFamily:"Cairo_400Regular",fontSize:12,color:Colors.textSecondary,flex:1,textAlign:"right"},
  callBtn: {flexDirection:"row-reverse",alignItems:"center",justifyContent:"center",gap:8,marginTop:8,paddingVertical:10,borderRadius:12},
  callTxt: {fontFamily:"Cairo_700Bold",fontSize:13,color:"#fff"},
});

// ─── Shared form styles ───────────────────────────────────────────────────────
const fm = StyleSheet.create({
  sheet:      {backgroundColor:Colors.cardBgElevated,borderTopLeftRadius:28,borderTopRightRadius:28,maxHeight:"90%",paddingHorizontal:20,paddingTop:8},
  handle:     {width:40,height:4,borderRadius:2,backgroundColor:Colors.divider,alignSelf:"center",marginBottom:14},
  title:      {fontFamily:"Cairo_700Bold",fontSize:18,color:Colors.textPrimary,textAlign:"right",marginBottom:14},
  label:      {fontFamily:"Cairo_600SemiBold",fontSize:13,color:Colors.textSecondary,textAlign:"right",marginBottom:6,marginTop:12},
  input:      {backgroundColor:Colors.bg,borderRadius:12,padding:12,fontFamily:"Cairo_400Regular",fontSize:14,color:Colors.textPrimary,borderWidth:1,borderColor:Colors.divider},
  chip:       {paddingHorizontal:14,paddingVertical:7,borderRadius:10,backgroundColor:Colors.bg,borderWidth:1,borderColor:Colors.divider},
  chipTxt:    {fontFamily:"Cairo_500Medium",fontSize:12,color:Colors.textMuted},
  imgBox:     {height:140,borderRadius:14,backgroundColor:Colors.bg,borderWidth:2,borderStyle:"dashed",borderColor:Colors.divider,justifyContent:"center",alignItems:"center",overflow:"hidden"},
  playerImgBox:{height:160,borderRadius:16,backgroundColor:Colors.bg,borderWidth:2,borderStyle:"dashed",borderColor:Colors.primary+"40",justifyContent:"center",alignItems:"center",overflow:"hidden",marginBottom:4},
  saveBtn:    {marginTop:18,borderRadius:14,overflow:"hidden"},
  saveBtnInner:{flexDirection:"row-reverse",alignItems:"center",justifyContent:"center",gap:8,paddingVertical:15},
  saveBtnTxt: {fontFamily:"Cairo_700Bold",fontSize:15,color:"#000"},
});

// ─── Add Post Modal ───────────────────────────────────────────────────────────
function AddPostModal({ visible, onClose, onSave }:{visible:boolean;onClose:()=>void;onSave:(p:KouraPost)=>void}) {
  const [title,setTitle]   = useState("");
  const [body,setBody]     = useState("");
  const [cat,setCat]       = useState<PostCategory>("خبر");
  const [imgUri,setImgUri] = useState("");
  const pickImg = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({mediaTypes:ImagePicker.MediaTypeOptions.Images,quality:0.65});
    if (!r.canceled && r.assets[0]) setImgUri(r.assets[0].uri);
  };
  const submit = () => {
    if (!title.trim()||!body.trim()) return;
    onSave({id:`p_${Date.now()}`,title:title.trim(),body:body.trim(),category:cat,imageUrl:imgUri||undefined,author:"إدارة الحصاحيصا كورة",likes:0,likedByMe:false,comments:[],createdAt:new Date().toISOString()});
    setTitle(""); setBody(""); setCat("خبر"); setImgUri(""); onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":"height"}>
        <Pressable style={{flex:1,backgroundColor:"rgba(0,0,0,0.72)",justifyContent:"flex-end"}} onPress={onClose}>
          <Pressable style={fm.sheet} onPress={e=>e.stopPropagation()}>
            <View style={fm.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={fm.title}>نشر خبر جديد</Text>
              <Text style={fm.label}>التصنيف</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingBottom:4}}>
                {(Object.keys(CAT_META) as PostCategory[]).map(c=>(
                  <TouchableOpacity key={c} style={[fm.chip,cat===c&&{backgroundColor:CAT_META[c].color+"25",borderColor:CAT_META[c].color}]} onPress={()=>setCat(c)}>
                    <Text style={[fm.chipTxt,cat===c&&{color:CAT_META[c].color}]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={fm.label}>العنوان *</Text>
              <TextInput style={fm.input} value={title} onChangeText={setTitle} placeholder="عنوان الخبر" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <Text style={fm.label}>المحتوى *</Text>
              <TextInput style={[fm.input,{height:110,textAlignVertical:"top",paddingTop:10}]} value={body} onChangeText={setBody} placeholder="تفاصيل الخبر..." placeholderTextColor={Colors.textMuted} textAlign="right" multiline />
              <Text style={fm.label}>صورة (اختياري)</Text>
              <TouchableOpacity style={fm.imgBox} onPress={pickImg}>
                {imgUri ? <Image source={{uri:imgUri}} style={{width:"100%",height:"100%"}} resizeMode="cover" />
                  : <><Ionicons name="image-outline" size={28} color={Colors.textMuted} /><Text style={{fontFamily:"Cairo_400Regular",fontSize:12,color:Colors.textMuted,marginTop:4}}>اضغط لاختيار صورة</Text></>}
              </TouchableOpacity>
              <TouchableOpacity style={fm.saveBtn} onPress={submit}>
                <LinearGradient colors={[Colors.primary,Colors.primaryDim]} style={fm.saveBtnInner}>
                  <Ionicons name="send" size={18} color="#000" />
                  <Text style={fm.saveBtnTxt}>نشر الخبر</Text>
                </LinearGradient>
              </TouchableOpacity>
              <View style={{height:28}} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add Player Modal ─────────────────────────────────────────────────────────
function AddPlayerModal({ visible, initial, onClose, onSave }:{visible:boolean;initial?:KouraPlayer;onClose:()=>void;onSave:(p:KouraPlayer)=>void}) {
  const [name,setName]     = useState(initial?.name||"");
  const [pos,setPos]       = useState<PlayerPosition>(initial?.position||"مهاجم");
  const [club,setClub]     = useState(initial?.club||"");
  const [num,setNum]       = useState(initial?.number||"");
  const [age,setAge]       = useState(initial?.age||"");
  const [bio,setBio]       = useState(initial?.bio||"");
  const [imgUri,setImgUri] = useState(initial?.imageUrl||"");
  const [goals,setGoals]   = useState(String(initial?.stats.goals||0));
  const [assists,setAsts]  = useState(String(initial?.stats.assists||0));
  const [matches,setMats]  = useState(String(initial?.stats.matches||0));
  const [yc,setYc]         = useState(String(initial?.stats.yellowCards||0));
  const [rc,setRc]         = useState(String(initial?.stats.redCards||0));
  useEffect(() => {
    if (visible && initial) {
      setName(initial.name); setPos(initial.position); setClub(initial.club);
      setNum(initial.number); setAge(initial.age); setBio(initial.bio||"");
      setImgUri(initial.imageUrl||""); setGoals(String(initial.stats.goals));
      setAsts(String(initial.stats.assists)); setMats(String(initial.stats.matches));
      setYc(String(initial.stats.yellowCards)); setRc(String(initial.stats.redCards));
    }
  }, [visible, initial]);
  const pickImg = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({mediaTypes:ImagePicker.MediaTypeOptions.Images,quality:0.75});
    if (!r.canceled && r.assets[0]) setImgUri(r.assets[0].uri);
  };
  const submit = () => {
    if (!name.trim()||!club.trim()) return;
    onSave({
      id:initial?.id||`pl_${Date.now()}`, name:name.trim(), position:pos, club:club.trim(),
      number:num.trim(), age:age.trim(), bio:bio.trim()||undefined, imageUrl:imgUri||undefined,
      stats:{goals:Number(goals)||0,assists:Number(assists)||0,matches:Number(matches)||0,yellowCards:Number(yc)||0,redCards:Number(rc)||0},
      featured:initial?.featured||false, featuredUntil:initial?.featuredUntil, featuredDays:initial?.featuredDays,
      createdAt:initial?.createdAt||new Date().toISOString(),
    });
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":"height"}>
        <Pressable style={{flex:1,backgroundColor:"rgba(0,0,0,0.72)",justifyContent:"flex-end"}} onPress={onClose}>
          <Pressable style={fm.sheet} onPress={e=>e.stopPropagation()}>
            <View style={fm.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={fm.title}>{initial?"تعديل بيانات لاعب":"إضافة لاعب جديد"}</Text>
              <TouchableOpacity style={fm.playerImgBox} onPress={pickImg}>
                {imgUri ? <Image source={{uri:imgUri}} style={{width:"100%",height:"100%",borderRadius:14}} resizeMode="cover" />
                  : <><Ionicons name="camera-outline" size={32} color={Colors.primary} /><Text style={{fontFamily:"Cairo_600SemiBold",fontSize:13,color:Colors.primary,marginTop:4}}>صورة اللاعب</Text><Text style={{fontFamily:"Cairo_400Regular",fontSize:11,color:Colors.textMuted}}>اضغط للاختيار</Text></>}
              </TouchableOpacity>
              <Text style={fm.label}>اسم اللاعب *</Text>
              <TextInput style={fm.input} value={name} onChangeText={setName} placeholder="الاسم الكامل" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <Text style={fm.label}>المركز *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingBottom:4}}>
                {POSITIONS.map(p=>(
                  <TouchableOpacity key={p} style={[fm.chip,pos===p&&{backgroundColor:POS_COLOR[p]+"25",borderColor:POS_COLOR[p]}]} onPress={()=>setPos(p)}>
                    <Text style={[fm.chipTxt,pos===p&&{color:POS_COLOR[p]}]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={fm.label}>النادي *</Text>
              <TextInput style={fm.input} value={club} onChangeText={setClub} placeholder="اسم النادي" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <View style={{flexDirection:"row-reverse",gap:10}}>
                <View style={{flex:1}}><Text style={fm.label}>رقم القميص</Text><TextInput style={fm.input} value={num} onChangeText={setNum} placeholder="10" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="center" /></View>
                <View style={{flex:1}}><Text style={fm.label}>العمر</Text><TextInput style={fm.input} value={age} onChangeText={setAge} placeholder="25" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="center" /></View>
              </View>
              <Text style={fm.label}>نبذة عن اللاعب</Text>
              <TextInput style={[fm.input,{height:70,textAlignVertical:"top",paddingTop:8}]} value={bio} onChangeText={setBio} placeholder="معلومات عن اللاعب..." placeholderTextColor={Colors.textMuted} textAlign="right" multiline />
              <Text style={fm.label}>الإحصائيات</Text>
              <View style={{flexDirection:"row-reverse",gap:8,flexWrap:"wrap"}}>
                {[{l:"أهداف",v:goals,s:setGoals},{l:"تمريرات",v:assists,s:setAsts},{l:"مباريات",v:matches,s:setMats},{l:"إنذارات",v:yc,s:setYc},{l:"طرد",v:rc,s:setRc}].map(({l,v,s})=>(
                  <View key={l} style={{flex:1,minWidth:68}}>
                    <Text style={[fm.label,{marginTop:4}]}>{l}</Text>
                    <TextInput style={fm.input} value={v} onChangeText={s} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="center" />
                  </View>
                ))}
              </View>
              <TouchableOpacity style={fm.saveBtn} onPress={submit}>
                <LinearGradient colors={[Colors.primary,Colors.primaryDim]} style={fm.saveBtnInner}>
                  <Ionicons name="save-outline" size={18} color="#000" />
                  <Text style={fm.saveBtnTxt}>حفظ اللاعب</Text>
                </LinearGradient>
              </TouchableOpacity>
              <View style={{height:28}} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add Match Modal ──────────────────────────────────────────────────────────
function AddMatchModal({ visible, onClose, onSave }:{visible:boolean;onClose:()=>void;onSave:(m:KouraMatch)=>void}) {
  const [home,setHome]   = useState("");
  const [away,setAway]   = useState("");
  const [comp,setComp]   = useState("");
  const [date,setDate]   = useState("");
  const [time,setTime]   = useState("");
  const [venue,setVenue] = useState("ملعب الحصاحيصا");
  const [status,setStatus] = useState<MatchStatus>("upcoming");
  const [hs,setHs]       = useState("");
  const [as_,setAs]      = useState("");
  const [desc,setDesc]   = useState("");
  const submit = () => {
    if (!home.trim()||!away.trim()||!comp.trim()||!date.trim()) return;
    onSave({id:`m_${Date.now()}`,homeTeam:home.trim(),awayTeam:away.trim(),competition:comp.trim(),date:date.trim(),time:time.trim(),venue:venue.trim(),homeScore:hs?Number(hs):undefined,awayScore:as_?Number(as_):undefined,status,description:desc.trim()||undefined,createdAt:new Date().toISOString()});
    setHome(""); setAway(""); setComp(""); setDate(""); setTime(""); setVenue("ملعب الحصاحيصا"); setStatus("upcoming"); setHs(""); setAs(""); setDesc(""); onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":"height"}>
        <Pressable style={{flex:1,backgroundColor:"rgba(0,0,0,0.72)",justifyContent:"flex-end"}} onPress={onClose}>
          <Pressable style={fm.sheet} onPress={e=>e.stopPropagation()}>
            <View style={fm.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={fm.title}>إضافة مباراة</Text>
              <Text style={fm.label}>المنافسة *</Text>
              <TextInput style={fm.input} value={comp} onChangeText={setComp} placeholder="اسم البطولة أو الدوري" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <View style={{flexDirection:"row-reverse",gap:10}}>
                <View style={{flex:1}}><Text style={fm.label}>الفريق المضيف *</Text><TextInput style={fm.input} value={home} onChangeText={setHome} placeholder="الفريق الأول" placeholderTextColor={Colors.textMuted} textAlign="right" /></View>
                <View style={{flex:1}}><Text style={fm.label}>الفريق الضيف *</Text><TextInput style={fm.input} value={away} onChangeText={setAway} placeholder="الفريق الثاني" placeholderTextColor={Colors.textMuted} textAlign="right" /></View>
              </View>
              <View style={{flexDirection:"row-reverse",gap:10}}>
                <View style={{flex:1}}><Text style={fm.label}>التاريخ *</Text><TextInput style={fm.input} value={date} onChangeText={setDate} placeholder="26/05/2026" placeholderTextColor={Colors.textMuted} textAlign="right" /></View>
                <View style={{flex:1}}><Text style={fm.label}>الوقت</Text><TextInput style={fm.input} value={time} onChangeText={setTime} placeholder="16:00" placeholderTextColor={Colors.textMuted} textAlign="center" /></View>
              </View>
              <Text style={fm.label}>الملعب</Text>
              <TextInput style={fm.input} value={venue} onChangeText={setVenue} placeholderTextColor={Colors.textMuted} textAlign="right" />
              <Text style={fm.label}>حالة المباراة</Text>
              <View style={{flexDirection:"row-reverse",gap:8}}>
                {([["upcoming","قادمة"],["live","مباشر"],["finished","انتهت"]] as const).map(([k,l])=>(
                  <TouchableOpacity key={k} style={[fm.chip,status===k&&{backgroundColor:Colors.primary+"25",borderColor:Colors.primary}]} onPress={()=>setStatus(k)}>
                    <Text style={[fm.chipTxt,status===k&&{color:Colors.primary}]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {(status==="live"||status==="finished") && (
                <View style={{flexDirection:"row-reverse",gap:10}}>
                  <View style={{flex:1}}><Text style={fm.label}>أهداف المضيف</Text><TextInput style={fm.input} value={hs} onChangeText={setHs} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="center" /></View>
                  <View style={{flex:1}}><Text style={fm.label}>أهداف الضيف</Text><TextInput style={fm.input} value={as_} onChangeText={setAs} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="center" /></View>
                </View>
              )}
              <Text style={fm.label}>ملاحظات</Text>
              <TextInput style={[fm.input,{height:60,textAlignVertical:"top",paddingTop:8}]} value={desc} onChangeText={setDesc} placeholder="تفاصيل إضافية..." placeholderTextColor={Colors.textMuted} textAlign="right" multiline />
              <TouchableOpacity style={fm.saveBtn} onPress={submit}>
                <LinearGradient colors={[Colors.primary,Colors.primaryDim]} style={fm.saveBtnInner}>
                  <Ionicons name="save-outline" size={18} color="#000" />
                  <Text style={fm.saveBtnTxt}>حفظ المباراة</Text>
                </LinearGradient>
              </TouchableOpacity>
              <View style={{height:28}} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add Club Modal ───────────────────────────────────────────────────────────
function AddClubModal({ visible, onClose, onSave }:{visible:boolean;onClose:()=>void;onSave:(c:SportClub)=>void}) {
  const [name,setName]     = useState("");
  const [sport,setSport]   = useState<SportClub["sport"]>("football");
  const [address,setAddr]  = useState("");
  const [phone,setPhone]   = useState("");
  const [founded,setFnd]   = useState("");
  const [desc,setDesc]     = useState("");
  const [colors,setColors] = useState("");
  const [achieve,setAch]   = useState("");
  const submit = () => {
    if (!name.trim()||!address.trim()) return;
    onSave({id:`cl_${Date.now()}`,name:name.trim(),sport,address:address.trim(),phone:phone.trim(),description:desc.trim()||undefined,founded:founded.trim()||undefined,colors:colors.trim()||undefined,achievements:achieve.trim()||undefined});
    setName(""); setAddr(""); setPhone(""); setFnd(""); setDesc(""); setColors(""); setAch(""); onClose();
  };
  const sportOpts: Array<[SportClub["sport"],string]> = [["football","قدم"],["basketball","سلة"],["volleyball","طائرة"],["athletics","قوى"],["swimming","سباحة"],["boxing","ملاكمة"],["other","أخرى"]];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":"height"}>
        <Pressable style={{flex:1,backgroundColor:"rgba(0,0,0,0.72)",justifyContent:"flex-end"}} onPress={onClose}>
          <Pressable style={fm.sheet} onPress={e=>e.stopPropagation()}>
            <View style={fm.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={fm.title}>إضافة نادٍ رياضي</Text>
              <Text style={fm.label}>الرياضة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingBottom:4}}>
                {sportOpts.map(([k,l])=>{const c=getSportColor(k);return(
                  <TouchableOpacity key={k} style={[fm.chip,sport===k&&{backgroundColor:c+"25",borderColor:c}]} onPress={()=>setSport(k)}>
                    <Text style={[fm.chipTxt,sport===k&&{color:c}]}>{l}</Text>
                  </TouchableOpacity>
                );})}
              </ScrollView>
              <Text style={fm.label}>اسم النادي *</Text>
              <TextInput style={fm.input} value={name} onChangeText={setName} placeholder="الاسم الرسمي" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <Text style={fm.label}>العنوان *</Text>
              <TextInput style={fm.input} value={address} onChangeText={setAddr} placeholder="الحي والشارع" placeholderTextColor={Colors.textMuted} textAlign="right" />
              <Text style={fm.label}>رقم التواصل</Text>
              <TextInput style={fm.input} value={phone} onChangeText={setPhone} placeholder="+249..." placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" textAlign="right" />
              <View style={{flexDirection:"row-reverse",gap:10}}>
                <View style={{flex:1}}><Text style={fm.label}>سنة التأسيس</Text><TextInput style={fm.input} value={founded} onChangeText={setFnd} placeholder="1990" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="center" /></View>
                <View style={{flex:1}}><Text style={fm.label}>ألوان النادي</Text><TextInput style={fm.input} value={colors} onChangeText={setColors} placeholder="أخضر وأبيض" placeholderTextColor={Colors.textMuted} textAlign="right" /></View>
              </View>
              <Text style={fm.label}>الإنجازات</Text>
              <TextInput style={[fm.input,{height:60,textAlignVertical:"top",paddingTop:8}]} value={achieve} onChangeText={setAch} placeholder="بطولات النادي..." placeholderTextColor={Colors.textMuted} textAlign="right" multiline />
              <Text style={fm.label}>وصف النادي</Text>
              <TextInput style={[fm.input,{height:60,textAlignVertical:"top",paddingTop:8}]} value={desc} onChangeText={setDesc} placeholder="نبذة مختصرة..." placeholderTextColor={Colors.textMuted} textAlign="right" multiline />
              <TouchableOpacity style={fm.saveBtn} onPress={submit}>
                <LinearGradient colors={[Colors.primary,Colors.primaryDim]} style={fm.saveBtnInner}>
                  <Ionicons name="save-outline" size={18} color="#000" />
                  <Text style={fm.saveBtnTxt}>حفظ النادي</Text>
                </LinearGradient>
              </TouchableOpacity>
              <View style={{height:28}} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Feature Player Modal ─────────────────────────────────────────────────────
function FeatureModal({ player, visible, onClose, onConfirm }:{
  player:KouraPlayer|null; visible:boolean; onClose:()=>void; onConfirm:(days:number)=>void;
}) {
  const [days, setDays] = useState("7");
  if (!player) return null;
  const active = isFeaturedActive(player);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{flex:1,backgroundColor:"rgba(0,0,0,0.72)",justifyContent:"center",padding:24}} onPress={onClose}>
        <Pressable onPress={e=>e.stopPropagation()}>
          <Animated.View entering={ZoomIn.springify().damping(16)} style={{backgroundColor:Colors.cardBg,borderRadius:24,padding:24,borderWidth:1,borderColor:"#F0A50040"}}>
            <View style={{alignItems:"center",marginBottom:16}}>
              <View style={{width:60,height:60,borderRadius:30,backgroundColor:"#F0A50018",justifyContent:"center",alignItems:"center",marginBottom:10}}>
                <Ionicons name="star" size={30} color="#F0A500" />
              </View>
              <Text style={{fontFamily:"Cairo_700Bold",fontSize:18,color:Colors.textPrimary,textAlign:"center"}}>{active?"إلغاء تمييز اللاعب":"تمييز وإعلان اللاعب"}</Text>
              <Text style={{fontFamily:"Cairo_400Regular",fontSize:13,color:Colors.textSecondary,textAlign:"center",marginTop:6,lineHeight:20}}>
                {active?"سيتوقف عرض اللاعب في قائمة المميزين":"يظهر اللاعب في أعلى القائمة بشارة ذهبية · مصدر دخل للتطبيق"}
              </Text>
            </View>
            {!active && (
              <>
                <Text style={{fontFamily:"Cairo_600SemiBold",fontSize:13,color:Colors.textSecondary,textAlign:"right",marginBottom:8}}>مدة الإعلان (أيام)</Text>
                <View style={{flexDirection:"row-reverse",gap:8,marginBottom:16}}>
                  {["3","7","14","30"].map(d=>(
                    <TouchableOpacity key={d} style={{flex:1,paddingVertical:10,borderRadius:10,backgroundColor:days===d?"#F0A500":"#F0A50015",alignItems:"center",borderWidth:1,borderColor:"#F0A50040"}} onPress={()=>setDays(d)}>
                      <Text style={{fontFamily:"Cairo_700Bold",fontSize:15,color:days===d?"#fff":"#F0A500"}}>{d}</Text>
                      <Text style={{fontFamily:"Cairo_400Regular",fontSize:10,color:days===d?"#fff":"#F0A500"}}>يوم</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={{flexDirection:"row-reverse",gap:10}}>
              <TouchableOpacity style={{flex:1,paddingVertical:12,borderRadius:12,backgroundColor:Colors.bg,borderWidth:1,borderColor:Colors.divider,alignItems:"center"}} onPress={onClose}>
                <Text style={{fontFamily:"Cairo_600SemiBold",fontSize:14,color:Colors.textSecondary}}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{flex:1,paddingVertical:12,borderRadius:12,backgroundColor:active?Colors.danger:"#F0A500",alignItems:"center"}} onPress={()=>onConfirm(active?0:Number(days))}>
                <Text style={{fontFamily:"Cairo_700Bold",fontSize:14,color:"#fff"}}>{active?"إنهاء التمييز":"تأكيد الإعلان"}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
type KouraTab = "news"|"players"|"matches"|"clubs";

export default function SportsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS==="web" ? 67 : insets.top;
  const auth = useAuth();

  const [posts,   setPosts]   = useState<KouraPost[]>([]);
  const [players, setPlayers] = useState<KouraPlayer[]>([]);
  const [matches, setMatches] = useState<KouraMatch[]>([]);
  const [clubs,   setClubs]   = useState<SportClub[]>([]);
  const [tab,     setTab]     = useState<KouraTab>("news");
  const [search,  setSearch]  = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [validatedPin, setValidatedPin] = useState<string | null>(null);
  const [pinModal, setPinModal]   = useState(false);
  const [pinInput, setPinInput]   = useState("");
  const [pinError, setPinError]   = useState("");

  const [selPost,   setSelPost]   = useState<KouraPost|null>(null);
  const [postDet,   setPostDet]   = useState(false);
  const [selPlayer, setSelPlayer] = useState<KouraPlayer|null>(null);
  const [playerDet, setPlayerDet] = useState(false);
  const [editPlayer,setEditPlayer]= useState<KouraPlayer|undefined>(undefined);
  const [addPost,   setAddPost]   = useState(false);
  const [addPlayer, setAddPlayer] = useState(false);
  const [addMatch,  setAddMatch]  = useState(false);
  const [addClub,   setAddClub]   = useState(false);
  const [featModal, setFeatModal] = useState(false);

  useEffect(() => {
    setIsAdmin(auth.user?.role === "admin" || auth.user?.role === "moderator");
  }, [auth.user]);

  const apiGet = useCallback(async (path: string) => {
    const base = getApiUrl();
    if (!base) return null;
    try {
      const res = await fetch(`${base}${path}`);
      if (res.ok) return res.json();
    } catch {}
    return null;
  }, []);

  const apiPost = useCallback(async (path: string, body: unknown) => {
    const base = getApiUrl();
    const token = auth.token;
    if (!base) return null;
    const headers: Record<string,string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (validatedPin) headers["x-admin-pin"] = validatedPin;
    try {
      const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      if (res.ok) return res.json();
    } catch {}
    return null;
  }, [auth.token, validatedPin]);

  const apiDelete = useCallback(async (path: string) => {
    const base = getApiUrl();
    const token = auth.token;
    if (!base) return false;
    const headers: Record<string,string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (validatedPin) headers["x-admin-pin"] = validatedPin;
    if (!token && !validatedPin) return false;
    try {
      const res = await fetch(`${base}${path}`, { method: "DELETE", headers });
      return res.ok;
    } catch { return false; }
  }, [auth.token, validatedPin]);

  const load = useCallback(async () => {
    const [postsData, playersData, matchesData] = await Promise.all([
      apiGet("/api/sports/posts"),
      apiGet("/api/sports/players"),
      apiGet("/api/sports/matches"),
    ]);
    if (postsData?.posts) {
      setPosts(postsData.posts.map((p: any) => ({
        id: String(p.id), title: p.title, body: p.content,
        category: p.type === "news" ? "خبر" : p.type === "result" ? "نتيجة" : "خبر",
        imageUrl: p.image_url || undefined, author: p.author_name,
        likes: p.likes, likedByMe: false, comments: [], createdAt: p.created_at,
      })));
    }
    if (playersData?.players) {
      setPlayers(playersData.players.map((p: any) => ({
        id: String(p.id), name: p.name, position: p.position,
        club: p.team, number: "", age: p.age ? String(p.age) : "",
        bio: p.bio || undefined, imageUrl: p.photo_url || undefined,
        goals: p.goals, assists: p.assists, matches: p.matches_played,
        featured: false,
      })));
    }
    if (matchesData?.matches) {
      setMatches(matchesData.matches.map((m: any) => ({
        id: String(m.id), teamA: m.home_team, teamB: m.away_team,
        scoreA: m.home_score != null ? String(m.home_score) : undefined,
        scoreB: m.away_score != null ? String(m.away_score) : undefined,
        date: m.match_date, venue: m.venue, status: m.status, notes: m.notes,
      })));
    }
    // Clubs from Firestore (fallback)
    const fsClubs = await loadSportClubs();
    setClubs(fsClubs);
  }, [apiGet]);

  useEffect(()=>{ load(); },[load]);
  useFocusEffect(useCallback(()=>{ load(); },[load]));

  const adminLogin = async () => {
    const base = getApiUrl();
    if (!base) { setPinError("لا يوجد اتصال بالخادم"); return; }
    try {
      const res = await fetch(`${base}/api/admin/validate-pin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (res.ok) {
        setIsAdmin(true); setValidatedPin(pinInput);
        setPinModal(false); setPinInput(""); setPinError("");
        if (Platform.OS!=="web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setPinError("رمز غير صحيح");
        if (Platform.OS!=="web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch { setPinError("خطأ في الاتصال"); }
  };
  const logout = async () => { setIsAdmin(false); setValidatedPin(null); };

  // Posts
  const savePost = async (p: KouraPost) => {
    const result = await apiPost("/api/sports/posts", {
      title: p.title, content: p.body,
      type: p.category === "نتيجة" ? "result" : p.category === "منافسة" ? "match_preview" : "news",
      image_url: p.imageUrl || null,
    });
    if (result) {
      const mapped: KouraPost = { ...p, id: String(result.id) };
      setPosts(prev => [mapped, ...prev]);
    }
  };
  const likePost = async (id: string) => {
    if (Platform.OS!=="web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const base = getApiUrl();
    if (base) {
      fetch(`${base}/api/sports/posts/${id}/like`, { method: "PATCH" })
        .then(r => r.ok ? r.json() : null).then(data => {
          if (data) {
            setPosts(prev => prev.map(p => p.id===id ? { ...p, likes: data.likes, likedByMe: !p.likedByMe } : p));
            if (selPost?.id===id) setSelPost(prev => prev ? { ...prev, likes: data.likes } : null);
          }
        }).catch(() => {});
    }
    // Optimistic update
    setPosts(prev => prev.map(p => p.id===id ? { ...p, likes: p.likedByMe?p.likes-1:p.likes+1, likedByMe: !p.likedByMe } : p));
  };
  const addComment = async (pid:string,text:string,author:string) => {
    const cmt:PostComment={id:`c_${Date.now()}`,author,text,createdAt:new Date().toISOString()};
    const u=posts.map(p=>p.id===pid?{...p,comments:[...p.comments,cmt]}:p);
    setPosts(u);
    setSelPost(u.find(p=>p.id===pid)||null);
  };
  const deletePost = async (id: string) => {
    const ok = await apiDelete(`/api/sports/posts/${id}`);
    if (ok) setPosts(prev => prev.filter(p => p.id!==id));
    else Alert.alert("خطأ", "تعذّر الحذف");
  };

  // Players
  const savePlayer = async (p: KouraPlayer) => {
    const body = { name: p.name, position: p.position, team: p.club, age: p.age ? Number(p.age) : null, bio: p.bio || null, photo_url: p.imageUrl || null };
    const ex = players.find(x => x.id===p.id);
    if (ex) {
      const base = getApiUrl(); const token = auth.token;
      if (base && token) {
        try {
          const res = await fetch(`${base}/api/sports/players/${p.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          });
          if (res.ok) setPlayers(prev => prev.map(x => x.id===p.id ? p : x));
        } catch {}
      }
    } else {
      const result = await apiPost("/api/sports/players", body);
      if (result) setPlayers(prev => [{ ...p, id: String(result.id) }, ...prev]);
    }
    setEditPlayer(undefined);
  };
  const deletePlayer = async (id: string) => {
    const ok = await apiDelete(`/api/sports/players/${id}`);
    if (ok) { setPlayers(prev => prev.filter(p => p.id!==id)); setPlayerDet(false); }
    else Alert.alert("خطأ", "تعذّر الحذف");
  };
  const featurePlayer = async (id: string, days: number) => {
    // Feature is local-only for now (not in DB schema)
    const u=players.map(p=>{
      if (p.id!==id) return p;
      if (days===0) return {...p,featured:false,featuredUntil:undefined,featuredDays:undefined};
      const until=new Date(); until.setDate(until.getDate()+days);
      return {...p,featured:true,featuredUntil:until.toISOString(),featuredDays:days};
    });
    setPlayers(u);
    setFeatModal(false); setPlayerDet(false);
    if (Platform.OS!=="web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // Matches
  const saveMatch = async (m: KouraMatch) => {
    const result = await apiPost("/api/sports/matches", {
      home_team: m.teamA, away_team: m.teamB,
      home_score: m.scoreA != null ? Number(m.scoreA) : null,
      away_score: m.scoreB != null ? Number(m.scoreB) : null,
      match_date: m.date, venue: m.venue || "ملعب الحصاحيصا",
      status: m.status || "upcoming", notes: m.notes || "",
    });
    if (result) setMatches(prev => [{ ...m, id: String(result.id) }, ...prev]);
  };
  const deleteMatch = async (id: string) => {
    const ok = await apiDelete(`/api/sports/matches/${id}`);
    if (ok) setMatches(prev => prev.filter(m => m.id!==id));
    else Alert.alert("خطأ", "تعذّر الحذف");
  };

  // Clubs — Firestore
  const saveClub = async (c: SportClub) => {
    try {
      const { id, ...data } = c;
      await fsAddDoc(COLLECTIONS.SPORTS_CLUBS, { ...data, createdAt: new Date().toISOString() });
      const updated = await loadSportClubs();
      setClubs(updated);
    } catch { const u = [c, ...clubs]; setClubs(u); }
  };
  const deleteClub = async (id: string) => {
    try {
      await fsDeleteDoc(COLLECTIONS.SPORTS_CLUBS, id);
      setClubs(prev => prev.filter(c => c.id !== id));
    } catch { setClubs(prev => prev.filter(c => c.id !== id)); }
  };

  // Derived
  const featuredPlayers  = players.filter(p=>isFeaturedActive(p));
  const regularPlayers   = players.filter(p=>!isFeaturedActive(p));
  const liveMatches      = matches.filter(m=>m.status==="live");
  const upcomingMatches  = matches.filter(m=>m.status==="upcoming");
  const finishedMatches  = matches.filter(m=>m.status==="finished");
  const filteredPosts    = posts.filter(p=>!search||p.title.includes(search)||p.body.includes(search));
  const filteredPlayers  = players.filter(p=>!search||p.name.includes(search)||p.club.includes(search));
  const filteredClubs    = clubs.filter(c=>!search||c.name.includes(search));

  const TABS = [
    {key:"news"    as KouraTab, icon:"newspaper-outline",  label:"الأخبار"},
    {key:"players" as KouraTab, icon:"person-outline",      label:"اللاعبون",  badge:featuredPlayers.length},
    {key:"matches" as KouraTab, icon:"trophy-outline",      label:"المباريات", badge:liveMatches.length},
    {key:"clubs"   as KouraTab, icon:"shield-outline",      label:"الأندية"},
  ];

  return (
    <View style={s.container}>
      {/* Modals */}
      <PostDetailModal post={selPost} visible={postDet} onClose={()=>setPostDet(false)}
        onLike={()=>selPost&&likePost(selPost.id)}
        onAddComment={(txt,auth)=>selPost&&addComment(selPost.id,txt,auth)} />
      <PlayerDetailModal player={selPlayer} visible={playerDet} onClose={()=>setPlayerDet(false)}
        admin={isAdmin} onFeature={()=>setFeatModal(true)}
        onEdit={()=>{ setEditPlayer(selPlayer!); setPlayerDet(false); setAddPlayer(true); }}
        onDelete={()=>selPlayer&&deletePlayer(selPlayer.id)} />
      <AddPostModal visible={addPost} onClose={()=>setAddPost(false)} onSave={savePost} />
      <AddPlayerModal visible={addPlayer} initial={editPlayer} onClose={()=>{ setAddPlayer(false); setEditPlayer(undefined); }} onSave={savePlayer} />
      <AddMatchModal visible={addMatch} onClose={()=>setAddMatch(false)} onSave={saveMatch} />
      <AddClubModal visible={addClub} onClose={()=>setAddClub(false)} onSave={saveClub} />
      <FeatureModal player={selPlayer} visible={featModal} onClose={()=>setFeatModal(false)} onConfirm={(days)=>selPlayer&&featurePlayer(selPlayer.id,days)} />

      {/* PIN Modal */}
      <Modal visible={pinModal} transparent animationType="fade" onRequestClose={()=>setPinModal(false)}>
        <Pressable style={s.pinOverlay} onPress={()=>setPinModal(false)}>
          <Pressable onPress={e=>e.stopPropagation()}>
            <Animated.View entering={ZoomIn.springify().damping(16)} style={s.pinCard}>
              <LinearGradient colors={[Colors.cardBgElevated,Colors.cardBg]} style={s.pinInner}>
                <View style={s.pinIconBox}><Ionicons name="football" size={32} color={Colors.primary} /></View>
                <Text style={s.pinTitle}>إدارة الحصاحيصا كورة</Text>
                <Text style={s.pinSub}>أدخل الرمز السري للوصول إلى لوحة الإدارة</Text>
                <TextInput style={s.pinInput} value={pinInput} onChangeText={v=>{setPinInput(v);setPinError("");}} placeholder="••••" placeholderTextColor={Colors.textMuted} secureTextEntry keyboardType="numeric" textAlign="center" maxLength={6} />
                {pinError ? <Text style={s.pinError}>{pinError}</Text> : null}
                <View style={{flexDirection:"row-reverse",gap:10,width:"100%",marginTop:8}}>
                  <TouchableOpacity style={[s.pinBtn,{backgroundColor:Colors.bg,borderWidth:1,borderColor:Colors.divider}]} onPress={()=>{setPinModal(false);setPinInput("");setPinError("");}}>
                    <Text style={{fontFamily:"Cairo_600SemiBold",fontSize:14,color:Colors.textSecondary}}>إلغاء</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.pinBtn,{overflow:"hidden"}]} onPress={adminLogin}>
                    <LinearGradient colors={[Colors.primary,Colors.primaryDim]} style={{flex:1,alignItems:"center",justifyContent:"center"}}>
                      <Text style={{fontFamily:"Cairo_700Bold",fontSize:14,color:"#000"}}>دخول</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Header */}
      <LinearGradient colors={["#0B1A0D",Colors.cardBg]} style={[s.header,{paddingTop:topPad+10}]}>
        <View style={s.headerTop}>
          <View style={{flexDirection:"row-reverse",gap:8,alignItems:"center"}}>
            {isAdmin ? (
              <>
                <TouchableOpacity style={s.adminBadge} onPress={logout}>
                  <Ionicons name="log-out-outline" size={13} color={Colors.primary} />
                  <Text style={s.adminBadgeTxt}>خروج</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.fabAdd} onPress={()=>{
                  if (tab==="news") setAddPost(true);
                  else if (tab==="players") setAddPlayer(true);
                  else if (tab==="matches") setAddMatch(true);
                  else setAddClub(true);
                }}>
                  <Ionicons name="add" size={18} color="#000" />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[s.adminBadge,{borderColor:Colors.divider}]} onPress={()=>setPinModal(true)}>
                <Ionicons name="lock-closed-outline" size={13} color={Colors.textMuted} />
                <Text style={[s.adminBadgeTxt,{color:Colors.textMuted}]}>إدارة</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={{alignItems:"flex-end"}}>
            <View style={{flexDirection:"row-reverse",alignItems:"center",gap:10}}>
              <View style={s.logoBox}><Ionicons name="football" size={22} color={Colors.primary} /></View>
              <View>
                <Text style={s.brandName}>الحصاحيصا كورة حديثة</Text>
                <Text style={s.brandSub}>أخبار · لاعبون · مباريات · أندية</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.searchRow}>
          <Ionicons name="search" size={15} color={Colors.textMuted} />
          <TextInput style={s.searchInput} placeholder="ابحث عن خبر، لاعب..." placeholderTextColor={Colors.textMuted} value={search} onChangeText={setSearch} textAlign="right" />
          {search.length>0 && <TouchableOpacity onPress={()=>setSearch("")}><Ionicons name="close-circle" size={16} color={Colors.textMuted} /></TouchableOpacity>}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
          {TABS.map(t=>(
            <TouchableOpacity key={t.key} style={[s.tabBtn,tab===t.key&&s.tabBtnActive]}
              onPress={()=>{ if(Platform.OS!=="web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTab(t.key); }}>
              {tab===t.key && <View style={s.tabLine} />}
              <Ionicons name={t.icon as any} size={15} color={tab===t.key?Colors.primary:Colors.textMuted} />
              <Text style={[s.tabTxt,tab===t.key&&s.tabTxtActive]}>{t.label}</Text>
              {t.badge&&t.badge>0 ? (
                <View style={[s.badge,{backgroundColor:t.key==="players"?"#F0A500":Colors.danger}]}>
                  <Text style={s.badgeTxt}>{t.badge}</Text>
                </View>
              ):null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      {/* NEWS */}
      {tab==="news" && (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad} showsVerticalScrollIndicator={false}>
          {liveMatches.length>0 && (
            <View style={s.liveBanner}>
              <View style={s.liveDot} />
              <Text style={s.liveTxt} numberOfLines={1}>
                مباشر: {liveMatches[0].homeTeam} {liveMatches[0].homeScore??0}–{liveMatches[0].awayScore??0} {liveMatches[0].awayTeam}
              </Text>
            </View>
          )}
          {filteredPosts.length===0 && (
            <View style={s.empty}>
              <Ionicons name="newspaper-outline" size={52} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>لا توجد أخبار بعد</Text>
              {isAdmin && <Text style={s.emptySub}>اضغط + لنشر أول خبر</Text>}
            </View>
          )}
          {filteredPosts.map((p,i)=>(
            <Animated.View key={p.id} entering={FadeInDown.delay(i*50).springify().damping(18)}>
              <PostCard post={p} onLike={()=>likePost(p.id)} onPress={()=>{setSelPost(p);setPostDet(true);}} admin={isAdmin} onDelete={()=>deletePost(p.id)} />
            </Animated.View>
          ))}
        </ScrollView>
      )}

      {/* PLAYERS */}
      {tab==="players" && (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad} showsVerticalScrollIndicator={false}>
          {featuredPlayers.length>0 && (
            <View style={{marginBottom:20}}>
              <View style={s.secHeader}>
                <Text style={s.secCount}>{featuredPlayers.length}</Text>
                <View style={{flexDirection:"row-reverse",alignItems:"center",gap:6}}>
                  <Ionicons name="star" size={14} color="#F0A500" />
                  <Text style={[s.secTitle,{color:"#F0A500"}]}>اللاعبون المميزون</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:14,paddingLeft:2}}>
                {featuredPlayers.map(p=>(
                  <TouchableOpacity key={p.id} onPress={()=>{setSelPlayer(p);setPlayerDet(true);}}>
                    <PlayerCard player={p} onPress={()=>{setSelPlayer(p);setPlayerDet(true);}} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{marginHorizontal:14,marginTop:8,padding:10,backgroundColor:"#F0A50010",borderRadius:10,borderWidth:1,borderColor:"#F0A50030"}}>
                <Text style={{fontFamily:"Cairo_400Regular",fontSize:11,color:"#F0A500",textAlign:"right"}}>⭐ اللاعبون المميزون يظهرون هنا مقابل إعلان مدفوع — للاستفسار تواصل مع إدارة التطبيق</Text>
              </View>
            </View>
          )}
          {filteredPlayers.filter(p=>!isFeaturedActive(p)).length>0 && (
            <>
              <View style={s.secHeader}>
                <Text style={s.secCount}>{regularPlayers.length}</Text>
                <Text style={s.secTitle}>سجل اللاعبين</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:14,paddingLeft:2}}>
                {filteredPlayers.filter(p=>!isFeaturedActive(p)).map(p=>(
                  <TouchableOpacity key={p.id} onPress={()=>{setSelPlayer(p);setPlayerDet(true);}}>
                    <PlayerCard player={p} onPress={()=>{setSelPlayer(p);setPlayerDet(true);}} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
          {players.length===0 && (
            <View style={s.empty}>
              <Ionicons name="person-outline" size={52} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>لا يوجد لاعبون بعد</Text>
              {isAdmin && <Text style={s.emptySub}>اضغط + لإضافة أول لاعب</Text>}
            </View>
          )}
        </ScrollView>
      )}

      {/* MATCHES */}
      {tab==="matches" && (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad} showsVerticalScrollIndicator={false}>
          {liveMatches.length>0 && (
            <>
              <Text style={[s.secTitle,{color:Colors.danger,marginBottom:10}]}>🔴 مباشر الآن</Text>
              {liveMatches.map((m,i)=>(
                <Animated.View key={m.id} entering={FadeInDown.delay(i*60).springify()}>
                  <MatchCard match={m} />
                  {isAdmin && <TouchableOpacity style={s.delChip} onPress={()=>deleteMatch(m.id)}><Ionicons name="trash-outline" size={12} color={Colors.danger}/><Text style={s.delChipTxt}>حذف</Text></TouchableOpacity>}
                </Animated.View>
              ))}
            </>
          )}
          {upcomingMatches.length>0 && (
            <>
              <Text style={[s.secTitle,{marginBottom:10,marginTop:liveMatches.length?16:0}]}>المباريات القادمة</Text>
              {upcomingMatches.map((m,i)=>(
                <Animated.View key={m.id} entering={FadeInDown.delay(i*60).springify()}>
                  <MatchCard match={m} />
                  {isAdmin && <TouchableOpacity style={s.delChip} onPress={()=>deleteMatch(m.id)}><Ionicons name="trash-outline" size={12} color={Colors.danger}/><Text style={s.delChipTxt}>حذف</Text></TouchableOpacity>}
                </Animated.View>
              ))}
            </>
          )}
          {finishedMatches.length>0 && (
            <>
              <Text style={[s.secTitle,{marginBottom:10,marginTop:16}]}>النتائج السابقة</Text>
              {finishedMatches.map((m,i)=>(
                <Animated.View key={m.id} entering={FadeInDown.delay(i*60).springify()}>
                  <MatchCard match={m} />
                  {isAdmin && <TouchableOpacity style={s.delChip} onPress={()=>deleteMatch(m.id)}><Ionicons name="trash-outline" size={12} color={Colors.danger}/><Text style={s.delChipTxt}>حذف</Text></TouchableOpacity>}
                </Animated.View>
              ))}
            </>
          )}
          {matches.length===0 && (
            <View style={s.empty}>
              <Ionicons name="trophy-outline" size={52} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>لا توجد مباريات بعد</Text>
              {isAdmin && <Text style={s.emptySub}>اضغط + لإضافة مباراة</Text>}
            </View>
          )}
        </ScrollView>
      )}

      {/* CLUBS */}
      {tab==="clubs" && (
        <ScrollView style={s.scroll} contentContainerStyle={s.pad} showsVerticalScrollIndicator={false}>
          {filteredClubs.length===0 && (
            <View style={s.empty}>
              <Ionicons name="shield-outline" size={52} color={Colors.textMuted} />
              <Text style={s.emptyTitle}>لا توجد أندية بعد</Text>
              {isAdmin && <Text style={s.emptySub}>اضغط + لإضافة نادٍ</Text>}
            </View>
          )}
          {filteredClubs.map((c,i)=>(
            <Animated.View key={c.id} entering={FadeInDown.delay(i*60).springify()}>
              <ClubCard club={c} />
              {isAdmin && <TouchableOpacity style={s.delChip} onPress={()=>deleteClub(c.id)}><Ionicons name="trash-outline" size={12} color={Colors.danger}/><Text style={s.delChipTxt}>حذف النادي</Text></TouchableOpacity>}
            </Animated.View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   {flex:1,backgroundColor:Colors.bg},
  header:      {paddingHorizontal:16,paddingBottom:0},
  headerTop:   {flexDirection:"row-reverse",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12},
  logoBox:     {width:42,height:42,borderRadius:12,backgroundColor:Colors.primary+"20",justifyContent:"center",alignItems:"center"},
  brandName:   {fontFamily:"Cairo_700Bold",fontSize:19,color:Colors.textPrimary,textAlign:"right"},
  brandSub:    {fontFamily:"Cairo_400Regular",fontSize:10,color:Colors.textMuted,textAlign:"right",marginTop:1},
  adminBadge:  {flexDirection:"row-reverse",alignItems:"center",gap:5,backgroundColor:Colors.primary+"18",borderRadius:10,paddingHorizontal:10,paddingVertical:6,borderWidth:1,borderColor:Colors.primary+"30"},
  adminBadgeTxt:{fontFamily:"Cairo_600SemiBold",fontSize:12,color:Colors.primary},
  fabAdd:      {width:34,height:34,borderRadius:10,backgroundColor:Colors.primary,justifyContent:"center",alignItems:"center"},
  searchRow:   {flexDirection:"row-reverse",alignItems:"center",backgroundColor:Colors.bg,borderRadius:12,paddingHorizontal:12,gap:8,marginBottom:10},
  searchInput: {flex:1,fontFamily:"Cairo_400Regular",fontSize:13,color:Colors.textPrimary,paddingVertical:9},
  tabsRow:     {flexDirection:"row-reverse",paddingBottom:0,gap:4,paddingRight:0},
  tabBtn:      {flexDirection:"row-reverse",alignItems:"center",gap:5,paddingHorizontal:12,paddingVertical:10,borderRadius:10,position:"relative"},
  tabBtnActive:{backgroundColor:Colors.primary+"12"},
  tabLine:     {position:"absolute",bottom:0,left:8,right:8,height:2,borderRadius:1,backgroundColor:Colors.primary},
  tabTxt:      {fontFamily:"Cairo_500Medium",fontSize:12,color:Colors.textMuted},
  tabTxtActive:{fontFamily:"Cairo_700Bold",fontSize:12,color:Colors.primary},
  badge:       {borderRadius:8,paddingHorizontal:5,paddingVertical:1,minWidth:16,alignItems:"center"},
  badgeTxt:    {fontFamily:"Cairo_700Bold",fontSize:9,color:"#fff"},
  scroll:      {flex:1},
  pad:         {padding:14,paddingBottom:100},
  secHeader:   {flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",marginBottom:12},
  secTitle:    {fontFamily:"Cairo_700Bold",fontSize:15,color:Colors.textPrimary,textAlign:"right"},
  secCount:    {fontFamily:"Cairo_400Regular",fontSize:12,color:Colors.textMuted},
  empty:       {alignItems:"center",paddingTop:60,gap:10},
  emptyTitle:  {fontFamily:"Cairo_600SemiBold",fontSize:17,color:Colors.textSecondary,textAlign:"center"},
  emptySub:    {fontFamily:"Cairo_400Regular",fontSize:13,color:Colors.textMuted,textAlign:"center"},
  liveBanner:  {flexDirection:"row-reverse",alignItems:"center",gap:8,backgroundColor:Colors.danger+"14",borderRadius:14,padding:12,marginBottom:14,borderWidth:1,borderColor:Colors.danger+"30"},
  liveDot:     {width:9,height:9,borderRadius:5,backgroundColor:Colors.danger},
  liveTxt:     {fontFamily:"Cairo_700Bold",fontSize:12,color:Colors.danger,flex:1,textAlign:"right"},
  delChip:     {flexDirection:"row-reverse",alignItems:"center",gap:4,alignSelf:"flex-end",paddingHorizontal:10,paddingVertical:4,borderRadius:8,backgroundColor:Colors.danger+"12",marginBottom:8,marginTop:-6},
  delChipTxt:  {fontFamily:"Cairo_500Medium",fontSize:11,color:Colors.danger},
  pinOverlay:  {flex:1,backgroundColor:"rgba(0,0,0,0.75)",justifyContent:"center",alignItems:"center",padding:24},
  pinCard:     {width:"100%",borderRadius:24,overflow:"hidden"},
  pinInner:    {padding:28,alignItems:"center",borderRadius:24,borderWidth:1,borderColor:Colors.divider},
  pinIconBox:  {width:64,height:64,borderRadius:18,backgroundColor:Colors.primary+"20",justifyContent:"center",alignItems:"center",marginBottom:14},
  pinTitle:    {fontFamily:"Cairo_700Bold",fontSize:18,color:Colors.textPrimary,textAlign:"center",marginBottom:6},
  pinSub:      {fontFamily:"Cairo_400Regular",fontSize:13,color:Colors.textSecondary,textAlign:"center",marginBottom:16,lineHeight:20},
  pinInput:    {width:"100%",backgroundColor:Colors.bg,borderRadius:14,padding:14,fontFamily:"Cairo_700Bold",fontSize:24,color:Colors.textPrimary,borderWidth:2,borderColor:Colors.divider,letterSpacing:8,textAlign:"center",marginBottom:6},
  pinError:    {fontFamily:"Cairo_500Medium",fontSize:13,color:Colors.danger,marginBottom:6},
  pinBtn:      {flex:1,height:46,borderRadius:12,justifyContent:"center",alignItems:"center"},
});
