/*
 * AREA — anti-debug / anti-Frida / anti-LLDB / anti-GDB primitives.
 *
 * Defensive anti-analysis checks for software you own and are authorized to
 * protect. Include this header and call the checks from scattered, irregular
 * points (not one obvious startup branch), then refuse sensitive paths silently.
 *
 * These raise the cost of REA's runtime tooling:
 *   - observe_native_calls (LLDB), start_gdb_session, start_rizin_debug_session
 *   - start_frida_session / load_frida_script
 *
 * They are DETERRENCE, not security. A skilled analyst can patch a branch.
 * Layer them under passive obfuscation (see native-hardening.md).
 */
#ifndef AREA_ANTI_DEBUG_H
#define AREA_ANTI_DEBUG_H

#include <stdint.h>

#if defined(__APPLE__)
  #include <sys/types.h>
  #include <sys/sysctl.h>
  #include <unistd.h>
  #include <ptrace.h>
#elif defined(__linux__)
  #include <sys/ptrace.h>
  #include <stdio.h>
  #include <unistd.h>
#elif defined(_WIN32)
  #include <windows.h>
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* ------------------------------------------------------------------ */
/* macOS: is a debugger tracing us (LLDB / DTrace)?                     */
/* ------------------------------------------------------------------ */
static int area_macos_debugged(void) {
#if defined(__APPLE__)
  int mib[4] = { CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid() };
  struct kinfo_proc info;
  size_t sz = sizeof(info);
  if (sysctl(mib, 4, &info, &sz, NULL, 0) == 0) {
    return (info.kp_proc.p_flag & P_TRACED) != 0;
  }
#endif
  return 0;
}

/* ------------------------------------------------------------------ */
/* Linux: refuse a tracer via PTRACE_TRACEME (fails if already traced) */
/* ------------------------------------------------------------------ */
static int area_linux_traced(void) {
#if defined(__linux__)
  if (ptrace(PTRACE_TRACEME, 0, 0, 0) == -1) return 1; /* already traced */
  /* TracerPid in /proc/self/status */
  FILE *f = fopen("/proc/self/status", "r");
  if (f) {
    char line[256];
    while (fgets(line, sizeof(line), f)) {
      if (line[0] == 'T' && line[1] == 'r') { /* TracerPid: */
        int pid = 0;
        sscanf(line, "TracerPid:%d", &pid);
        fclose(f);
        return pid != 0;
      }
    }
    fclose(f);
  }
#endif
  return 0;
}

/* ------------------------------------------------------------------ */
/* Windows: PEB.BeingDebugged + NtGlobalFlag                            */
/* ------------------------------------------------------------------ */
static int area_win_debugged(void) {
#if defined(_WIN32)
  if (IsDebuggerPresent()) return 1;
  #if defined(_M_X64) || defined(_M_IX86)
  uintptr_t peb = 0;
  #if defined(_M_X64)
  peb = __readgsqword(0x60);
  #else
  peb = __readfsdword(0x30);
  #endif
  /* +0x02 BeingDebugged, +0xBC NtGlobalFlag (x64) */
  uint8_t beingDebugged = *(uint8_t *)(peb + 0x02);
  if (beingDebugged) return 1;
  #endif
#endif
  return 0;
}

/* ------------------------------------------------------------------ */
/* Cross-platform: am I being debugged?                                 */
/* ------------------------------------------------------------------ */
static int area_is_debugged(void) {
  return area_macos_debugged() || area_linux_traced() || area_win_debugged();
}

/* ------------------------------------------------------------------ */
/* macOS: deny future LLDB attach (non-hardened processes).             */
/* Call once early; release builds should instead use Hardened Runtime   */
/* WITHOUT the get-task-allow entitlement.                             */
/* ------------------------------------------------------------------ */
static void area_deny_attach(void) {
#if defined(__APPLE__)
  ptrace(PT_DENY_ATTACH, 0, 0, 0);
#else
  (void)0;
#endif
}

/* ------------------------------------------------------------------ */
/* Frida: detect frida-server's default TCP port (27042) locally.       */
/* Lightweight: connect() to 127.0.0.1:27042 and see if it succeeds.   */
/* ------------------------------------------------------------------ */
static int area_frida_port_open(void) {
#if defined(_WIN32) || defined(__linux__) || defined(__APPLE__)
  /* Minimal socket probe; include winsock2.h on Windows before windows.h. */
  #if defined(_WIN32)
    /* requires WSAStartup; see full source below */
    return 0;
  #else
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <arpa/inet.h>
    #include <fcntl.h>
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return 0;
    struct sockaddr_in a;
    a.sin_family = AF_INET;
    a.sin_port = htons(27042);
    a.sin_addr.s_addr = inet_addr("127.0.0.1");
    int ok = (connect(fd, (struct sockaddr *)&a, sizeof(a)) == 0);
    close(fd);
    return ok;
  #endif
#else
  return 0;
#endif
}

/* ------------------------------------------------------------------ */
/* Frida: scan own address space for the "frida" / "gadget" agent name. */
/* Linux: grep /proc/self/maps for frida-agent / gadget.               */
/* ------------------------------------------------------------------ */
static int area_frida_agent_present(void) {
#if defined(__linux__)
  FILE *f = fopen("/proc/self/maps", "r");
  if (!f) return 0;
  char line[512];
  while (fgets(line, sizeof(line), f)) {
    if (strstr(line, "frida-agent") || strstr(line, "gadget") ||
        strstr(line, "LIBFRIDA")) {
      fclose(f);
      return 1;
    }
  }
  fclose(f);
#endif
  return 0;
}

/* ------------------------------------------------------------------ */
/* Combined: refuse if any instrumentation is present.                  */
/* Call from a background thread at irregular intervals; degrade/exit  */
/* the sensitive path (not necessarily the whole app).                 */
/* ------------------------------------------------------------------ */
static int area_hostile_environment(void) {
  return area_is_debugged() || area_frida_port_open() || area_frida_agent_present();
}

#ifdef __cplusplus
}
#endif

#endif /* AREA_ANTI_DEBUG_H */
