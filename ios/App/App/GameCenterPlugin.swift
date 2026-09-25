import UIKit
import Capacitor
import GameKit

// =====================================================================
//  ECZACI — Game Center köprüsü (uygulamaya gömülü yerel Capacitor eklentisi)
// =====================================================================
// Neden hazır eklenti değil: Capacitor 8 + Swift Package Manager ile çalışan, iOS tarafı
// bakımda olan bir Game Center eklentisi yok (openforge/capacitor-game-connect Capacitor 5'te
// kaldı; capacitor-play-games iOS kodunu tamamen çıkardı). GameKit çağrıları az ve basit
// olduğu için eklenti burada, uygulamanın içinde duruyor — ek npm paketi yok.
//
// JS tarafı (index.html → GC modülü) bunu `window.Capacitor.Plugins.GameCenter` olarak görür:
//   signIn()                                  → { authenticated, playerId?, displayName? }
//   status()                                  → aynı, oturum AÇMAYA ÇALIŞMAZ
//   submitScore({ leaderboardId, score })     → skor gönderir (Game Center en iyisini tutar)
//   loadTopScores({ leaderboardId, count, scope?, time? })
//                                             → { entries: [{rank, score, formattedScore,
//                                                 displayName, playerId, isLocal}], local?, total }
//   showLeaderboard({ leaderboardId })        → Apple'ın kendi sıralama ekranı
//   olay: "authChanged" (oyuncu Ayarlar'dan giriş/çıkış yaparsa)

/// SceneDelegate kök görünüm denetleyicisi olarak bunu kurar; eklenti köprü yüklenirken,
/// web görünümü açılmadan ÖNCE kaydedilir (JS ilk satırından itibaren görür).
class EczaciBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
    }
}

@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadTopScores", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise)
    ]

    private var waiting: [CAPPluginCall] = []   // oturum sonucu bekleyen signIn çağrıları
    private var handlerSet = false               // authenticateHandler uygulama ömründe BİR kez kurulur
    private var authAnswered = false             // GameKit en az bir kez cevap verdi mi

    private func playerInfo(_ error: Error? = nil) -> [String: Any] {
        let p = GKLocalPlayer.local
        if p.isAuthenticated {
            return ["authenticated": true, "playerId": p.gamePlayerID, "displayName": p.displayName]
        }
        var r: [String: Any] = ["authenticated": false]
        if let e = error { r["error"] = e.localizedDescription }
        return r
    }

    // Oturum: GameKit giriş ekranı gerekiyorsa verir, biz sunarız. Oyuncu kapatırsa bir daha
    // zorlanmaz (Apple kuralı) — o zaman "authenticated: false" döner, oyun yerel rekorla sürer.
    @objc func signIn(_ call: CAPPluginCall) {
        if GKLocalPlayer.local.isAuthenticated { call.resolve(playerInfo()); return }
        if authAnswered && handlerSet { call.resolve(playerInfo()); return }
        waiting.append(call)
        if handlerSet { return }
        handlerSet = true
        DispatchQueue.main.async {
            GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, error in
                guard let self = self else { return }
                if let vc = viewController {
                    self.bridge?.viewController?.present(vc, animated: true)
                    return
                }
                self.authAnswered = true
                let info = self.playerInfo(error)
                let calls = self.waiting
                self.waiting = []
                for c in calls { c.resolve(info) }
                self.notifyListeners("authChanged", data: info)
            }
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(playerInfo())
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboardId"), let score = call.getInt("score") else {
            call.reject("leaderboardId ve score gerekli", "BAD_ARGS"); return
        }
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Game Center oturumu yok", "NOT_AUTHENTICATED"); return
        }
        GKLeaderboard.submitScore(score, context: call.getInt("context") ?? 0,
                                  player: GKLocalPlayer.local, leaderboardIDs: [id]) { error in
            if let e = error { call.reject(e.localizedDescription, "SUBMIT_FAILED", e) }
            else { call.resolve() }
        }
    }

    @objc func loadTopScores(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboardId") else {
            call.reject("leaderboardId gerekli", "BAD_ARGS"); return
        }
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Game Center oturumu yok", "NOT_AUTHENTICATED"); return
        }
        let count = max(1, min(call.getInt("count") ?? 3, 100))
        let scope: GKLeaderboard.PlayerScope = call.getString("scope") == "friends" ? .friendsOnly : .global
        let time: GKLeaderboard.TimeScope
        switch call.getString("time") {
        case "today": time = .today
        case "week": time = .week
        default: time = .allTime
        }
        GKLeaderboard.loadLeaderboards(IDs: [id]) { boards, error in
            guard let board = boards?.first else {
                call.reject(error?.localizedDescription ?? "Sıralama bulunamadı: \(id)", "NOT_FOUND"); return
            }
            board.loadEntries(for: scope, timeScope: time, range: NSRange(location: 1, length: count)) { local, entries, total, error in
                if let e = error { call.reject(e.localizedDescription, "LOAD_FAILED", e); return }
                let me = GKLocalPlayer.local.gamePlayerID
                func pack(_ e: GKLeaderboard.Entry) -> [String: Any] {
                    return ["rank": e.rank, "score": e.score, "formattedScore": e.formattedScore,
                            "displayName": e.player.displayName, "playerId": e.player.gamePlayerID,
                            "isLocal": e.player.gamePlayerID == me]
                }
                var result: [String: Any] = ["entries": (entries ?? []).map(pack), "total": total]
                if let l = local { result["local"] = pack(l) }
                call.resolve(result)
            }
        }
    }

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        let id = call.getString("leaderboardId")
        DispatchQueue.main.async {
            let vc: GKGameCenterViewController
            if let id = id {
                vc = GKGameCenterViewController(leaderboardID: id, playerScope: .global, timeScope: .allTime)
            } else {
                vc = GKGameCenterViewController(state: .leaderboards)
            }
            vc.gameCenterDelegate = self
            self.bridge?.viewController?.present(vc, animated: true)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
