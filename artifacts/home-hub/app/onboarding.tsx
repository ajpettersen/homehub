import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { Redirect, router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetMeQueryKey,
  useCompleteOnboarding,
  useGetMe,
  useUpdateHousehold,
} from "@workspace/api-client-react";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";

type FamilyRole = "child" | "pet";
type PropertyType = "house" | "cabin";
type ModuleKey = "chores" | "groceries" | "maintenance" | "tasks" | "workouts" | "people";

interface Member {
  id: string;
  name: string;
  role: FamilyRole;
  color: string;
}

interface OnboardingState {
  householdName: string;
  property: { name: string; type: PropertyType; address: string };
  familyMembers: Member[];
  modules: Record<ModuleKey, boolean>;
  starter: { groceryListName: string; seedChores: boolean; seedMaintenance: boolean };
}

const MEMBER_COLORS = ["#EF4444", "#F97316", "#EAB308", "#22C55E", "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6"];
const STARTER_CHORES = [
  { title: "Take out the trash", frequency: "weekly" as const },
  { title: "Vacuum the floors", frequency: "weekly" as const },
  { title: "Wipe down counters", frequency: "daily" as const },
];
const STARTER_MAINTENANCE = [
  { title: "Replace HVAC filter", category: "filter" as const, frequencyDays: 90 },
  { title: "Test smoke detectors", category: "seasonal" as const, frequencyDays: 180 },
  { title: "Clean gutters", category: "seasonal" as const, frequencyDays: 180 },
];
const MODULES: Array<{ key: ModuleKey; title: string; description: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = [
  { key: "chores", title: "Chores", description: "Daily and weekly routines", icon: "sparkles-outline" },
  { key: "groceries", title: "Groceries & meals", description: "Meal plans and shopping lists", icon: "cart-outline" },
  { key: "maintenance", title: "Home maintenance", description: "Keep up with your property", icon: "hammer-outline" },
  { key: "tasks", title: "Shared tasks", description: "Household projects and to-dos", icon: "checkbox-outline" },
  { key: "workouts", title: "Workouts", description: "Plans for family members", icon: "barbell-outline" },
  { key: "people", title: "People", description: "Family and trusted contacts", icon: "people-outline" },
];

export default function OnboardingScreen() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: me, isLoading: isLoadingMe, isError: isMeError, refetch: refetchMe } = useGetMe({ query: { enabled: !!isSignedIn } as any });
  const completeOnboarding = useCompleteOnboarding();
  const updateHousehold = useUpdateHousehold();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showSkip, setShowSkip] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState<FamilyRole>("child");
  const [memberColor, setMemberColor] = useState(MEMBER_COLORS[0]);
  const [state, setState] = useState<OnboardingState>({
    householdName: "",
    property: { name: "", type: "house", address: "" },
    familyMembers: [],
    modules: { chores: true, groceries: true, maintenance: true, tasks: true, workouts: true, people: true },
    starter: { groceryListName: "Groceries", seedChores: true, seedMaintenance: true },
  });

  const isSubmitting = completeOnboarding.isPending || updateHousehold.isPending;
  const selectedModules = MODULES.filter((module) => state.modules[module.key]);
  const needsStarterStep = state.modules.chores || state.modules.groceries || state.modules.maintenance;
  const totalSteps = needsStarterStep ? 6 : 5;
  const displayStep = needsStarterStep || step < 4 ? step : step - 1;
  const isValid = useMemo(() => {
    if (step === 0) return state.householdName.trim().length > 0;
    if (step === 1) return state.property.name.trim().length > 0;
    return true;
  }, [state.householdName, state.property.name, step]);

  if (!isAuthLoaded || (isSignedIn && isLoadingMe)) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (isMeError || !me) {
    return (
      <View style={[styles.profileError, { backgroundColor: colors.background }]}>
        <Text style={[styles.profileErrorTitle, { color: colors.foreground }]}>We couldn't load your family access.</Text>
        <Text style={[styles.profileErrorBody, { color: colors.mutedForeground }]}>Check your connection and try again.</Text>
        <Pressable onPress={() => refetchMe()} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
          <Text style={[styles.retryButtonText, { color: colors.primaryForeground }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (me.role !== "family" || !me.isAdmin || me.onboardingCompleted) {
    return <Redirect href="/(home)/(tabs)" />;
  }

  const next = () => {
    setError(null);
    if (step === 3 && !needsStarterStep) setStep(5);
    else setStep((current) => Math.min(5, current + 1));
  };

  const back = () => {
    setError(null);
    if (step === 5 && !needsStarterStep) setStep(3);
    else setStep((current) => Math.max(0, current - 1));
  };

  const addMember = () => {
    const name = memberName.trim();
    if (!name) return;
    setState((current) => ({
      ...current,
      familyMembers: [...current.familyMembers, { id: `${Date.now()}-${Math.random()}`, name, role: memberRole, color: memberColor }],
    }));
    setMemberName("");
    setMemberColor(MEMBER_COLORS[(MEMBER_COLORS.indexOf(memberColor) + 1) % MEMBER_COLORS.length]);
  };

  const finish = async () => {
    setError(null);
    try {
      await completeOnboarding.mutateAsync({
        data: {
          householdName: state.householdName.trim(),
          property: {
            name: state.property.name.trim(),
            type: state.property.type,
            address: state.property.address.trim() || null,
          },
          familyMembers: state.familyMembers.map(({ name, role, color }) => ({ name, role, color })),
          groceryListName: state.modules.groceries ? state.starter.groceryListName.trim() || "Groceries" : null,
          chores: state.modules.chores && state.starter.seedChores ? STARTER_CHORES : [],
          maintenanceTasks: state.modules.maintenance && state.starter.seedMaintenance ? STARTER_MAINTENANCE : [],
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      router.replace("/(home)/(tabs)");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't finish setup. Please try again.");
    }
  };

  const skip = async () => {
    setError(null);
    try {
      await updateHousehold.mutateAsync({ data: { onboardingCompleted: true } });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setShowSkip(false);
      router.replace("/(home)/(tabs)");
    } catch {
      setShowSkip(false);
      setError("We couldn't skip setup. Please try again.");
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${((displayStep + 1) / totalSteps) * 100}%` }]} />
        </View>
        {!isSubmitting && (
          <Pressable testID="onboarding-skip" onPress={() => setShowSkip(true)} hitSlop={12}>
            <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip setup</Text>
          </Pressable>
        )}
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        bottomOffset={72}
        keyboardDismissMode="interactive"
      >
        {step === 0 && (
          <StepShell icon="home-outline" title="Welcome home." subtitle="What should we call your household?">
            <TextInput
              testID="onboarding-household-name"
              autoFocus
              value={state.householdName}
              onChangeText={(householdName) => setState((current) => ({ ...current, householdName }))}
              placeholder="The Smiths"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="next"
              onSubmitEditing={() => isValid && next()}
              style={[styles.heroInput, { color: colors.foreground, borderBottomColor: colors.border }]}
            />
          </StepShell>
        )}

        {step === 1 && (
          <StepShell icon="business-outline" title="Tell us about your home." subtitle="Set up your first property. You can add more later.">
            <Label text="Property name" />
            <TextInput
              testID="onboarding-property-name"
              value={state.property.name}
              onChangeText={(name) => setState((current) => ({ ...current, property: { ...current.property, name } }))}
              placeholder="Main House"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
            />
            <Label text="Property type" />
            <View style={styles.row}>
              {(["house", "cabin"] as const).map((type) => (
                <ChoiceCard key={type} selected={state.property.type === type} onPress={() => setState((current) => ({ ...current, property: { ...current.property, type } }))} icon={type === "house" ? "home-outline" : "trail-sign-outline"} title={type === "house" ? "House" : "Cabin"} />
              ))}
            </View>
            <Label text="Address (optional)" />
            <TextInput
              value={state.property.address}
              onChangeText={(address) => setState((current) => ({ ...current, property: { ...current.property, address } }))}
              placeholder="123 Main Street"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
            />
          </StepShell>
        )}

        {step === 2 && (
          <StepShell icon="people-outline" title="Who's in your family?" subtitle="Add children and pets now, or continue and add them later.">
            {state.familyMembers.map((member) => (
              <View key={member.id} style={[styles.memberRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.avatar, { backgroundColor: member.color }]}><Text style={styles.avatarText}>{member.name[0]?.toUpperCase()}</Text></View>
                <View style={styles.memberText}><Text style={[styles.memberName, { color: colors.foreground }]}>{member.name}</Text><Text style={[styles.memberRole, { color: colors.mutedForeground }]}>{member.role}</Text></View>
                <Pressable testID={`remove-member-${member.id}`} onPress={() => setState((current) => ({ ...current, familyMembers: current.familyMembers.filter((item) => item.id !== member.id) }))} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                </Pressable>
              </View>
            ))}
            <View style={[styles.addCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <TextInput
                testID="onboarding-member-name"
                value={memberName}
                onChangeText={setMemberName}
                onSubmitEditing={addMember}
                placeholder="Family member's name"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
              />
              <View style={styles.row}>
                {(["child", "pet"] as const).map((role) => <Pill key={role} label={role} selected={memberRole === role} onPress={() => setMemberRole(role)} />)}
              </View>
              <View style={styles.colorRow}>
                {MEMBER_COLORS.map((color) => (
                  <Pressable key={color} accessibilityLabel={`Choose ${color}`} onPress={() => setMemberColor(color)} style={[styles.colorDot, { backgroundColor: color }, memberColor === color && { borderColor: colors.foreground, borderWidth: 3 }]} />
                ))}
              </View>
              <Pressable testID="onboarding-add-member" disabled={!memberName.trim()} onPress={addMember} style={[styles.addButton, { borderColor: colors.primary }, !memberName.trim() && styles.disabled]}>
                <Ionicons name="add" size={20} color={colors.primary} /><Text style={[styles.addButtonText, { color: colors.primary }]}>Add member</Text>
              </Pressable>
            </View>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell icon="options-outline" title="What matters most?" subtitle="Choose what you'd like HomeHub to organize first.">
            <View style={styles.moduleGrid}>
              {MODULES.map((module) => <ModuleCard key={module.key} title={module.title} description={module.description} icon={module.icon} selected={state.modules[module.key]} onPress={() => setState((current) => ({ ...current, modules: { ...current.modules, [module.key]: !current.modules[module.key] } }))} />)}
            </View>
          </StepShell>
        )}

        {step === 4 && (
          <StepShell icon="sparkles-outline" title="Start with a head start." subtitle="We'll add a few useful basics so your home is ready right away.">
            {state.modules.groceries && <StarterCard icon="cart-outline" title="Groceries"><Label text="First shopping list" /><TextInput value={state.starter.groceryListName} onChangeText={(groceryListName) => setState((current) => ({ ...current, starter: { ...current.starter, groceryListName } }))} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} /></StarterCard>}
            {state.modules.chores && <StarterCard icon="sparkles-outline" title="Chores"><ToggleRow label="Add sensible starter chores" selected={state.starter.seedChores} onPress={() => setState((current) => ({ ...current, starter: { ...current.starter, seedChores: !current.starter.seedChores } }))} /></StarterCard>}
            {state.modules.maintenance && <StarterCard icon="hammer-outline" title="Maintenance"><ToggleRow label="Add a basic upkeep schedule" selected={state.starter.seedMaintenance} onPress={() => setState((current) => ({ ...current, starter: { ...current.starter, seedMaintenance: !current.starter.seedMaintenance } }))} /></StarterCard>}
          </StepShell>
        )}

        {step === 5 && (
          <StepShell icon="checkmark-circle-outline" title="Ready to move in?" subtitle="Review the home we're about to set up.">
            <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ReviewRow icon="home-outline" title={state.householdName} detail={`${state.property.name} · ${state.property.type}`} />
              <ReviewRow icon="people-outline" title={`${state.familyMembers.length} family member${state.familyMembers.length === 1 ? "" : "s"}`} detail={state.familyMembers.map((member) => member.name).join(", ") || "You can add members later"} />
              <ReviewRow icon="options-outline" title={`${selectedModules.length} focus area${selectedModules.length === 1 ? "" : "s"}`} detail={selectedModules.map((module) => module.title).join(", ") || "None selected"} />
            </View>
          </StepShell>
        )}

        {error && <Text style={[styles.error, { color: colors.destructive, backgroundColor: `${colors.destructive}12` }]}>{error}</Text>}

        <View style={styles.footer}>
          {step > 0 && !isSubmitting && <Pressable testID="onboarding-back" onPress={back} style={styles.backButton}><Ionicons name="arrow-back" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Back</Text></Pressable>}
          <Pressable
            testID={step === 5 ? "onboarding-finish" : "onboarding-next"}
            disabled={!isValid || isSubmitting}
            onPress={step === 5 ? finish : next}
            style={[styles.primaryButton, { backgroundColor: colors.primary }, (!isValid || isSubmitting) && styles.disabled]}
          >
            {isSubmitting ? <ActivityIndicator color={colors.primaryForeground} /> : <><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{step === 5 ? "Finish setup" : "Continue"}</Text><Ionicons name={step === 5 ? "checkmark" : "arrow-forward"} size={20} color={colors.primaryForeground} /></>}
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>

      <Modal visible={showSkip} transparent animationType="fade" onRequestClose={() => setShowSkip(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Skip guided setup?</Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>You'll enter an empty HomeHub, but you can add everything from the app later.</Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowSkip(false)} style={[styles.modalButton, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>Keep setting up</Text></Pressable>
              <Pressable testID="confirm-skip-onboarding" onPress={skip} style={[styles.modalButton, { backgroundColor: colors.primary }]}>{updateHousehold.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>Skip</Text>}</Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StepShell({ icon, title, subtitle, children }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; subtitle: string; children: React.ReactNode }) {
  const colors = useColors();
  return <View><View style={[styles.iconTile, { backgroundColor: colors.primary }]}><Ionicons name={icon} size={28} color={colors.primaryForeground} /></View><Text style={[styles.title, { color: colors.foreground }]}>{title}</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text><View style={styles.stepBody}>{children}</View></View>;
}

function Label({ text }: { text: string }) {
  const colors = useColors();
  return <Text style={[styles.label, { color: colors.mutedForeground }]}>{text}</Text>;
}

function ChoiceCard({ selected, onPress, icon, title }: { selected: boolean; onPress: () => void; icon: React.ComponentProps<typeof Ionicons>["name"]; title: string }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={[styles.choiceCard, { backgroundColor: selected ? colors.secondary : colors.card, borderColor: selected ? colors.primary : colors.border }]}><Ionicons name={icon} size={26} color={selected ? colors.primary : colors.mutedForeground} /><Text style={[styles.choiceTitle, { color: selected ? colors.primary : colors.foreground }]}>{title}</Text></Pressable>;
}

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={[styles.pill, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}><Text style={[styles.pillText, { color: selected ? colors.primaryForeground : colors.foreground }]}>{label[0].toUpperCase() + label.slice(1)}</Text></Pressable>;
}

function ModuleCard({ title, description, icon, selected, onPress }: { title: string; description: string; icon: React.ComponentProps<typeof Ionicons>["name"]; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={[styles.moduleCard, { backgroundColor: selected ? colors.secondary : colors.card, borderColor: selected ? colors.primary : colors.border }]}><Ionicons name={icon} size={24} color={selected ? colors.primary : colors.mutedForeground} /><View style={styles.moduleText}><Text style={[styles.moduleTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.moduleDescription, { color: colors.mutedForeground }]}>{description}</Text></View><Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={23} color={selected ? colors.primary : colors.border} /></Pressable>;
}

function StarterCard({ icon, title, children }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; children: React.ReactNode }) {
  const colors = useColors();
  return <View style={[styles.starterCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.starterHeading}><Ionicons name={icon} size={22} color={colors.primary} /><Text style={[styles.starterTitle, { color: colors.foreground }]}>{title}</Text></View>{children}</View>;
}

function ToggleRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={styles.toggleRow}><Text style={[styles.toggleLabel, { color: colors.foreground }]}>{label}</Text><Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={26} color={selected ? colors.primary : colors.border} /></Pressable>;
}

function ReviewRow({ icon, title, detail }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; detail: string }) {
  const colors = useColors();
  return <View style={styles.reviewRow}><View style={[styles.reviewIcon, { backgroundColor: colors.secondary }]}><Ionicons name={icon} size={22} color={colors.primary} /></View><View style={styles.reviewText}><Text style={[styles.reviewTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.reviewDetail, { color: colors.mutedForeground }]}>{detail}</Text></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  profileError: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  profileErrorTitle: { fontFamily: "Inter_700Bold", fontSize: 20, textAlign: "center" },
  profileErrorBody: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  retryButton: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  retryButtonText: { fontFamily: "Inter_600SemiBold" },
  header: { paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 16 },
  progressTrack: { height: 5, borderRadius: 3, flex: 1, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  skipText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 36, maxWidth: 620, width: "100%", alignSelf: "center" },
  iconTile: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 24, transform: [{ rotate: "-3deg" }] },
  title: { fontFamily: "Inter_700Bold", fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 17, lineHeight: 25, marginTop: 8 },
  stepBody: { gap: 14, marginTop: 30 },
  heroInput: { fontFamily: "Inter_600SemiBold", fontSize: 27, paddingVertical: 12, borderBottomWidth: 2 },
  label: { fontFamily: "Inter_700Bold", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: "Inter_500Medium", fontSize: 16 },
  row: { flexDirection: "row", gap: 12 },
  choiceCard: { flex: 1, minHeight: 104, borderWidth: 2, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 8 },
  choiceTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  memberRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, padding: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 17 },
  memberText: { flex: 1, marginLeft: 12 },
  memberName: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  memberRole: { fontFamily: "Inter_400Regular", fontSize: 12, textTransform: "capitalize", marginTop: 2 },
  addCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 14 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  addButton: { height: 46, borderWidth: 1, borderRadius: 12, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  addButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  pill: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  pillText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  moduleGrid: { gap: 10 },
  moduleCard: { minHeight: 78, borderWidth: 1.5, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  moduleText: { flex: 1 },
  moduleTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  moduleDescription: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 3 },
  starterCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 13 },
  starterHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  starterTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  toggleRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  toggleLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15 },
  reviewCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 18 },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  reviewIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  reviewText: { flex: 1 },
  reviewTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16 },
  reviewDetail: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, marginTop: 3 },
  error: { fontFamily: "Inter_500Medium", fontSize: 14, textAlign: "center", marginTop: 18, padding: 12, borderRadius: 10 },
  footer: { marginTop: "auto", paddingTop: 34, flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  backButton: { minHeight: 52, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  backText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  primaryButton: { minHeight: 52, borderRadius: 14, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 148 },
  primaryButtonText: { fontFamily: "Inter_700Bold", fontSize: 16 },
  disabled: { opacity: 0.45 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", padding: 16 },
  modalCard: { borderRadius: 22, padding: 22, gap: 12, marginBottom: 12 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 22 },
  modalBody: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  modalButton: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
});